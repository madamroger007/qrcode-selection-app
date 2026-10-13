use std::collections::HashSet;

use image::ImageReader;
use rxing::{BarcodeFormat, DecodeHints, Exceptions};


/// Decode QR codes from raw PNG bytes.
///
/// Returns `Ok(Vec<String>)` where:
/// - A non-empty `Vec` contains the decoded text for each QR code found.
/// - An empty `Vec` means the image was valid but contained no QR code.
///
/// Returns `Err(String)` only for genuine processing failures (e.g. the bytes
/// are not a valid image, or an unexpected rxing error occurs).  A "not found"
/// result from rxing is **not** treated as an error.
pub fn decode_qr_from_bytes(image_bytes: &[u8]) -> Result<Vec<String>, String> {
    // Decode PNG bytes into a DynamicImage.
    let cursor = std::io::Cursor::new(image_bytes);
    let img = ImageReader::new(cursor)
        .with_guessed_format()
        .map_err(|e| format!("Failed to read image format: {e}"))?
        .decode()
        .map_err(|e| format!("Failed to decode image: {e}"))?;

    // Build decode hints restricted to QR_CODE only.
    let mut hints = DecodeHints {
        PossibleFormats: Some(HashSet::from([BarcodeFormat::QR_CODE])),
        ..DecodeHints::default()
    };

    // Attempt to detect all QR codes in the image.
    match rxing::helpers::detect_multiple_in_image_with_hints(img, &mut hints) {
        Ok(results) => {
            let texts: Vec<String> = results
                .iter()
                .map(|r| r.getText().to_owned())
                .collect();
            Ok(texts)
        }
        Err(Exceptions::NotFoundException(_)) => {
            // No QR code found — this is a normal outcome, not an error.
            Ok(vec![])
        }
        Err(e) => Err(format!("QR decoding error: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::decode_qr_from_bytes;

    // ── helpers ─────────────────────────────────────────────────────────────

    /// Encode `text` as a QR code and return the PNG bytes.
    /// Uses the `qrcode` crate (dev-dependency only).
    fn qr_png_bytes(text: &str) -> Vec<u8> {
        use image::Luma;
        use qrcode::QrCode;

        let code = QrCode::new(text.as_bytes()).expect("qrcode encode failed");
        let img = code.render::<Luma<u8>>().build();

        let mut buf = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut buf),
            image::ImageFormat::Png,
        )
        .expect("PNG encode failed");
        buf
    }

    /// Stitch two QR images side-by-side and return the composite PNG bytes.
    fn two_qr_png_bytes(left_text: &str, right_text: &str) -> Vec<u8> {
        use image::{DynamicImage, GenericImage, Luma};
        use qrcode::QrCode;

        let render_qr = |text: &str| -> image::ImageBuffer<Luma<u8>, Vec<u8>> {
            let code = QrCode::new(text.as_bytes()).expect("qrcode encode failed");
            code.render::<Luma<u8>>().build()
        };

        let left = render_qr(left_text);
        let right = render_qr(right_text);

        let (lw, lh) = left.dimensions();
        let (rw, rh) = right.dimensions();
        let total_width = lw + rw;
        let total_height = lh.max(rh);

        let mut canvas =
            DynamicImage::new_luma8(total_width, total_height);
        canvas
            .copy_from(&DynamicImage::ImageLuma8(left), 0, 0)
            .expect("copy left failed");
        canvas
            .copy_from(&DynamicImage::ImageLuma8(right), lw, 0)
            .expect("copy right failed");

        let mut buf = Vec::new();
        canvas
            .write_to(
                &mut std::io::Cursor::new(&mut buf),
                image::ImageFormat::Png,
            )
            .expect("PNG encode failed");
        buf
    }

    // ── tests ────────────────────────────────────────────────────────────────

    /// Invalid/corrupt bytes must return `Err(_)`.
    #[test]
    fn invalid_bytes_returns_err() {
        let result = decode_qr_from_bytes(b"not a png");
        assert!(result.is_err(), "expected Err for corrupt bytes, got Ok");
    }

    /// A plain solid-colour PNG (no QR content) must return `Ok(vec![])`.
    #[test]
    fn plain_png_no_qr_returns_empty() {
        use image::RgbImage;

        // Create a 200×200 all-white image and encode it as PNG.
        let img = RgbImage::new(200, 200);
        let mut buf = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut buf),
            image::ImageFormat::Png,
        )
        .expect("PNG encode failed");

        let result = decode_qr_from_bytes(&buf).expect("decode should not error on valid PNG");
        assert!(
            result.is_empty(),
            "expected empty vec for plain PNG, got: {result:?}"
        );
    }

    /// A PNG with exactly one QR code must return `Ok(vec![expected_text])`.
    #[test]
    fn single_qr_returns_correct_text() {
        let expected = "Hello, QR!";
        let png_bytes = qr_png_bytes(expected);

        let result = decode_qr_from_bytes(&png_bytes).expect("decode should not error");
        assert_eq!(
            result,
            vec![expected.to_string()],
            "single QR decode mismatch"
        );
    }

    /// A PNG with two side-by-side QR codes must return `Ok` with both texts.
    #[test]
    fn multi_qr_returns_correct_count_and_content() {
        let text1 = "First QR code";
        let text2 = "Second QR code";
        let png_bytes = two_qr_png_bytes(text1, text2);

        let result = decode_qr_from_bytes(&png_bytes).expect("decode should not error");

        assert_eq!(result.len(), 2, "expected 2 QR results, got: {result:?}");

        // Order is not guaranteed by rxing, so use a set comparison.
        let result_set: std::collections::HashSet<&str> =
            result.iter().map(String::as_str).collect();
        assert!(
            result_set.contains(text1),
            "result missing '{text1}': {result:?}"
        );
        assert!(
            result_set.contains(text2),
            "result missing '{text2}': {result:?}"
        );
    }
}
