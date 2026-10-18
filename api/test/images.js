// Tiny but structurally valid image headers for upload tests.
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF\0fake-jpeg-body"), Buffer.from([0xff, 0xd9])]);
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png")]);
export const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0, 0, 0]), Buffer.from("WEBPVP8 fake")]);
