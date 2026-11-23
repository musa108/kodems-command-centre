import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdirSync, writeFileSync, createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const SIG: Array<{ mime: string; ext: string; test: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', ext: 'jpg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: b => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'video/mp4', ext: 'mp4', test: b => b.slice(4, 8).toString('ascii') === 'ftyp' },
  { mime: 'application/pdf', ext: 'pdf', test: b => b.slice(0, 5).toString('ascii') === '%PDF-' },
];
export const MAX_UPLOAD = 25 * 1024 * 1024;

/** Storage boundary. Local disk in development; production must bind an S3-compatible adapter (see docs/DEPLOYMENT.md). */
@Injectable()
export class StorageService {
  readonly dir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  get backend() { return process.env.S3_ENDPOINT && process.env.S3_BUCKET ? 's3-configured-adapter-pending' : 'local-disk'; }
  /** Validates by magic bytes (declared MIME is never trusted) and size. */
  validate(file: { buffer: Buffer; size: number; mimetype: string; originalname: string }) {
    if (!file?.buffer?.length) throw new BadRequestException({ code: 'EMPTY_FILE', message: 'Empty file' });
    if (file.size > MAX_UPLOAD) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'File exceeds 25 MB' });
    const sig = SIG.find(s => s.test(file.buffer));
    if (!sig) throw new BadRequestException({ code: 'FILE_TYPE_REJECTED', message: 'Only JPEG, PNG, MP4 and PDF files are allowed' });
    return sig;
  }
  save(file: { buffer: Buffer; size: number; mimetype: string; originalname: string }) {
    const sig = this.validate(file);
    mkdirSync(this.dir, { recursive: true });
    const key = `${randomUUID()}.${sig.ext}`;
    writeFileSync(join(this.dir, key), file.buffer);
    return { key, mime: sig.mime, size: file.size };
  }
  stream(key: string) {
    if (!/^[0-9a-f-]{36}\.(jpg|png|mp4|pdf)$/.test(key)) throw new BadRequestException('bad key');
    const p = join(this.dir, key); return existsSync(p) ? createReadStream(p) : null;
  }
}
