import type { IStorage, StorageEntry } from '@pragmatic-tech-ai/todl-runtime'
import type { IGcsBucket } from './gcs-bucket.js'

/** GCS-backed object store over an injectable IGcsBucket seam. Reproduces InMemoryObjectStore semantics:
 *  directories are derived from key prefixes; explicit empty directories are zero-byte marker objects at
 *  `<dir>/`. Text is utf-8, bytes are raw. Rename is copy-then-delete (non-atomic). Implements IStorage
 *  ONLY (no Stat/Watch/local-file companions), so the runtime capability guards report false. */
export class GcsObjectStore implements IStorage
{
    private static readonly NotFoundPrefix = 'ENOENT: '
    private static readonly Separator = '/'
    private static readonly PathSplitter = /[\\/]/

    public readonly Root: string
    private readonly bucket: IGcsBucket

    public constructor(bucket: IGcsBucket, root: string)
    {
        this.bucket = bucket
        this.Root = root
    }

    public async ReadText(path: string): Promise<string>
    {
        return new TextDecoder().decode(await this.Require(path))
    }

    public ReadBytes(path: string): Promise<Uint8Array>
    {
        return this.Require(path)
    }

    public WriteText(path: string, content: string): Promise<void>
    {
        return this.bucket.Save(GcsObjectStore.Normalize(path), new TextEncoder().encode(content))
    }

    public WriteBytes(path: string, bytes: Uint8Array): Promise<void>
    {
        return this.bucket.Save(GcsObjectStore.Normalize(path), bytes)
    }

    public async Exists(path: string): Promise<boolean>
    {
        const key = GcsObjectStore.Normalize(path)
        if (key === '')
        {
            return true
        }
        if ((await this.bucket.Download(key)) !== undefined)
        {
            return true
        }
        const prefix = key + GcsObjectStore.Separator
        const keys = await this.bucket.ListKeys()
        return keys.some(k => k.startsWith(prefix))
    }

    public async Delete(path: string): Promise<void>
    {
        const key = GcsObjectStore.Normalize(path)
        const prefix = key + GcsObjectStore.Separator
        const keys = await this.bucket.ListKeys()
        for (const k of keys)
        {
            if (k === key || k.startsWith(prefix))
            {
                await this.bucket.Delete(k)
            }
        }
    }

    public async CreateDirectory(path: string): Promise<void>
    {
        let key = GcsObjectStore.Normalize(path)
        while (key !== '')
        {
            await this.bucket.Save(key + GcsObjectStore.Separator, new Uint8Array(0))
            key = GcsObjectStore.ParentOf(key)
        }
    }

    public async Rename(from: string, to: string): Promise<void>
    {
        const src = GcsObjectStore.Normalize(from)
        const dst = GcsObjectStore.Normalize(to)
        const keys = await this.bucket.ListKeys()
        for (const key of keys)
        {
            const isMarker = GcsObjectStore.IsMarker(key)
            const name = isMarker ? GcsObjectStore.StripMarker(key) : key
            const rewritten = GcsObjectStore.Rewrite(name, src, dst)
            if (rewritten === undefined)
            {
                continue
            }
            const next = isMarker ? (rewritten === '' ? '' : rewritten + GcsObjectStore.Separator) : rewritten
            const bytes = await this.bucket.Download(key)
            if (bytes !== undefined && next !== '')
            {
                await this.bucket.Save(next, bytes)
            }
            if (next !== key)
            {
                await this.bucket.Delete(key)
            }
        }
    }

    public async List(path: string): Promise<readonly StorageEntry[]>
    {
        const dir = GcsObjectStore.Normalize(path)
        const prefix = dir === '' ? '' : dir + GcsObjectStore.Separator
        const children = new Map<string, boolean>()
        for (const key of await this.bucket.ListKeys())
        {
            if (GcsObjectStore.IsMarker(key))
            {
                GcsObjectStore.CollectChild(children, GcsObjectStore.StripMarker(key), prefix, true)
            }
            else
            {
                GcsObjectStore.CollectChild(children, key, prefix, false)
            }
        }
        return [...children].map(([Name, IsDirectory]) => ({ Name, IsDirectory }))
    }

    private async Require(path: string): Promise<Uint8Array>
    {
        const key = GcsObjectStore.Normalize(path)
        const bytes = await this.bucket.Download(key)
        if (bytes === undefined)
        {
            throw new Error(`${GcsObjectStore.NotFoundPrefix}${key}`)
        }
        return bytes
    }

    private static IsMarker(key: string): boolean
    {
        return key.endsWith(GcsObjectStore.Separator)
    }

    private static StripMarker(key: string): string
    {
        return GcsObjectStore.Normalize(key)
    }

    private static CollectChild(children: Map<string, boolean>, key: string, prefix: string, forceDirectory: boolean): void
    {
        if (!key.startsWith(prefix))
        {
            return
        }
        const rest = key.slice(prefix.length)
        if (rest === '')
        {
            return
        }
        const slash = rest.indexOf(GcsObjectStore.Separator)
        if (slash === -1)
        {
            children.set(rest, forceDirectory || (children.get(rest) ?? false))
        }
        else
        {
            children.set(rest.slice(0, slash), true)
        }
    }

    private static Rewrite(key: string, src: string, dst: string): string | undefined
    {
        if (key === src)
        {
            return dst
        }
        if (key.startsWith(src + GcsObjectStore.Separator))
        {
            return GcsObjectStore.Normalize(dst + key.slice(src.length))
        }
        return undefined
    }

    private static Normalize(path: string): string
    {
        return path.split(GcsObjectStore.PathSplitter).filter(s => s.length > 0).join(GcsObjectStore.Separator)
    }

    private static ParentOf(key: string): string
    {
        const slash = key.lastIndexOf(GcsObjectStore.Separator)
        return slash === -1 ? '' : key.slice(0, slash)
    }
}
