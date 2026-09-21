import { describe, expect, it } from "vitest";
import {
  sanitizeVkError,
  validateExternalFetchUrl,
  validateUploadUrl,
} from "../src/security.js";

describe("security & url validation (SSRF guard)", () => {
  describe("validateUploadUrl", () => {
    it("allows valid HTTPS VK upload hosts (*.vk.com, *.vk.ru, *.userapi.com)", () => {
      expect(validateUploadUrl("https://pu.vk.com/c123456/upload.php")).toEqual({
        valid: true,
      });
      expect(validateUploadUrl("https://upload.vk.ru/upload.php")).toEqual({
        valid: true,
      });
      expect(validateUploadUrl("https://cs12345.userapi.com/u123/a_xyz.jpg")).toEqual({
        valid: true,
      });
      expect(validateUploadUrl("https://vk.com/upload")).toEqual({
        valid: true,
      });
      expect(validateUploadUrl("https://vk.ru/upload")).toEqual({
        valid: true,
      });
      expect(validateUploadUrl("https://userapi.com/upload")).toEqual({
        valid: true,
      });
    });

    it("allows allowed ports (default 443, explicit 443, 8443)", () => {
      expect(validateUploadUrl("https://pu.vk.com:443/upload")).toEqual({
        valid: true,
      });
      expect(validateUploadUrl("https://pu.vk.com:8443/upload")).toEqual({
        valid: true,
      });
    });

    it("rejects non-HTTPS schemes (http, ftp, file)", () => {
      expect(validateUploadUrl("http://pu.vk.com/upload")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("ftp://pu.vk.com/upload")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("file:///etc/passwd")).toMatchObject({
        valid: false,
      });
    });

    it("rejects non-standard ports", () => {
      expect(validateUploadUrl("https://pu.vk.com:80/upload")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("https://pu.vk.com:8080/upload")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("https://pu.vk.com:22/upload")).toMatchObject({
        valid: false,
      });
    });

    it("rejects embedded credentials", () => {
      expect(
        validateUploadUrl("https://user:pass@pu.vk.com/upload"),
      ).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("https://user@pu.vk.com/upload")).toMatchObject({
        valid: false,
      });
    });

    it("rejects non-VK hosts", () => {
      expect(validateUploadUrl("https://attacker.com/upload")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("https://fakevk.com/upload")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("https://vk.com.evil.com/upload")).toMatchObject({
        valid: false,
      });
    });

    it("rejects loopback IPv4/IPv6 and localhost", () => {
      expect(validateUploadUrl("https://127.0.0.1/upload")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("https://localhost/upload")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("https://[::1]/upload")).toMatchObject({
        valid: false,
      });
    });

    it("rejects private network ranges", () => {
      expect(validateUploadUrl("https://10.0.0.1/upload")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("https://172.16.0.1/upload")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("https://192.168.1.1/upload")).toMatchObject({
        valid: false,
      });
    });

    it("rejects link-local and cloud metadata endpoints", () => {
      expect(
        validateUploadUrl("https://169.254.169.254/latest/meta-data"),
      ).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("https://[fe80::1]/upload")).toMatchObject({
        valid: false,
      });
    });

    it("rejects invalid/malformed URLs", () => {
      expect(validateUploadUrl("not-a-url")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("")).toMatchObject({
        valid: false,
      });
      expect(validateUploadUrl("javascript:alert(1)")).toMatchObject({
        valid: false,
      });
    });
  });

  describe("validateExternalFetchUrl", () => {
    it("allows valid public HTTPS URLs for fetching external media", () => {
      expect(
        validateExternalFetchUrl("https://images.unsplash.com/photo-123.jpg"),
      ).toEqual({
        valid: true,
      });
      expect(
        validateExternalFetchUrl("https://cdn.example.org:8443/media/art.png"),
      ).toEqual({
        valid: true,
      });
    });

    it("rejects non-HTTPS schemes", () => {
      expect(
        validateExternalFetchUrl("http://images.unsplash.com/photo.jpg"),
      ).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("ftp://example.com/photo.jpg")).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("file:///etc/hosts")).toMatchObject({
        valid: false,
      });
    });

    it("rejects loopback and localhost", () => {
      expect(validateExternalFetchUrl("https://localhost/photo.jpg")).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("https://127.0.0.1/photo.jpg")).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("https://127.0.0.5:443/photo.jpg")).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("https://[::1]/photo.jpg")).toMatchObject({
        valid: false,
      });
    });

    it("rejects private network ranges", () => {
      expect(validateExternalFetchUrl("https://10.1.2.3/photo.jpg")).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("https://172.20.1.1/photo.jpg")).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("https://192.168.0.254/photo.jpg")).toMatchObject({
        valid: false,
      });
    });

    it("rejects link-local, cloud metadata, and IPv6 unique local", () => {
      expect(
        validateExternalFetchUrl("https://169.254.169.254/latest/meta-data"),
      ).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("https://[fe80::1]/photo.jpg")).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("https://[fc00::1]/photo.jpg")).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("https://[fd12:3456::1]/photo.jpg")).toMatchObject({
        valid: false,
      });
    });

    it("rejects embedded credentials and non-standard ports", () => {
      expect(
        validateExternalFetchUrl("https://admin:secret@example.com/photo.jpg"),
      ).toMatchObject({
        valid: false,
      });
      expect(
        validateExternalFetchUrl("https://example.com:8080/photo.jpg"),
      ).toMatchObject({
        valid: false,
      });
    });

    it("rejects malformed URLs", () => {
      expect(validateExternalFetchUrl("bad-url")).toMatchObject({
        valid: false,
      });
      expect(validateExternalFetchUrl("")).toMatchObject({
        valid: false,
      });
    });
  });

  describe("sanitizeVkError", () => {
    it("redacts VK access tokens matching pattern vk1.a...", () => {
      const mockPrefix = ["vk1", "a"].join(".");
      const errorMsg =
        `Failed with token ${mockPrefix}.abcdefghijklmnopqrstuvwxyz0123456789_ABC-DEF and call failed`;
      expect(sanitizeVkError(errorMsg)).toBe(
        "Failed with token [REDACTED] and call failed",
      );
    });

    it("strips authorization query params like access_token=...", () => {
      const mockPrefix = ["vk1", "a"].join(".");
      const errorMsg =
        `Request to https://api.vk.com/method/wall.post?access_token=${mockPrefix}.secret1234567890abcdefghijklmnopqrstuvwxyz&v=5.199 failed`;
      expect(sanitizeVkError(errorMsg)).toBe(
        "Request to https://api.vk.com/method/wall.post?access_token=[REDACTED]&v=5.199 failed",
      );
    });

    it("handles multiple tokens and query params in arbitrary error strings", () => {
      const mockPrefix = ["vk1", "a"].join(".");
      const complex =
        `error: access_token=xyz9876543210zyxwvutsrqponmlkjihgfedcba&other=1 ${mockPrefix}.1111111111222222222233333333334444444444`;
      const sanitized = sanitizeVkError(complex);
      expect(sanitized).not.toContain("xyz9876543210zyxwvutsrqponmlkjihgfedcba");
      expect(sanitized).not.toContain("1111111111222222222233333333334444444444");
      expect(sanitized).toContain("[REDACTED]");
    });
  });
});
