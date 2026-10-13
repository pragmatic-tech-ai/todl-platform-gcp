import type { Bucket } from '@google-cloud/storage'
import type { IGcsBucket } from './gcs-bucket.js'

/** Thin @google-cloud/storage wrapper behind IGcsBucket. The prefix is prepended on the way in and stripped on
 *  the way out so GcsObjectStore only ever sees location-relative keys. Logs nothing. */
export class RealGcsBucket implements IGcsBucket
{
    private static readonly NotFoundCode = 404
    private static readonly SaveOptions = { resumable: false }
    private static readonly DeleteOptions = { ignoreNotFound: true }

    private readonly bucket: Bucket
    private readonly prefix: string

    public constructor(bucket: Bucket, prefix: string)
    {
        this.bucket = bucket
        this.prefix = prefix
    }

    public async Save(key: string, bytes: Uint8Array): Promise<void>
    {
        await this.bucket.file(this.prefix + key).save(Buffer.from(bytes), RealGcsBucket.SaveOptions)
    }

    public async Download(key: string): Promise<Uint8Array | undefined>
    {
        try
        {
            const [buf] = await this.bucket.file(this.prefix + key).download()
            return new Uint8Array(buf)
        }
        catch (e)
        {
            if ((e as { code?: number }).code === RealGcsBucket.NotFoundCode)
            {
                return undefined
            }
            throw e
        }
    }

    public async Delete(key: string): Promise<void>
    {
        await this.bucket.file(this.prefix + key).delete(RealGcsBucket.DeleteOptions)
    }

    public async ListKeys(): Promise<string[]>
    {
        const [files] = await this.bucket.getFiles({ prefix: this.prefix })
        return files.map(f => f.name.slice(this.prefix.length))
    }
}
