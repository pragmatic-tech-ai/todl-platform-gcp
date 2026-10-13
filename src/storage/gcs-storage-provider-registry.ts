import type { Storage } from '@google-cloud/storage'
import type { IStorageProviderRegistry } from '@pragmatic-tech-ai/todl'
import type { IStorage } from '@pragmatic-tech-ai/todl-runtime'
import { GcsObjectStore } from './gcs-object-store.js'
import { RealGcsBucket } from './real-gcs-bucket.js'

/** GCS storage provider registry: one GcsObjectStore per location, each isolated under its own object-name
 *  prefix (`basePrefix/location/`) within a single bucket. A repeated location returns the cached store. */
export class GcsStorageProviderRegistry implements IStorageProviderRegistry
{
    private static readonly Separator = '/'
    private static readonly RootScheme = 'gcs://'

    private readonly stores = new Map<string, GcsObjectStore>()
    private readonly storage: Storage
    private readonly bucketName: string
    private readonly basePrefix: string

    public constructor(storage: Storage, bucketName: string, basePrefix: string)
    {
        this.storage = storage
        this.bucketName = bucketName
        this.basePrefix = basePrefix
    }

    public CreateStorage(location: string): IStorage
    {
        const existing = this.stores.get(location)
        if (existing !== undefined)
        {
            return existing
        }
        const prefix = this.PrefixFor(location)
        const created = new GcsObjectStore(
            new RealGcsBucket(this.storage.bucket(this.bucketName), prefix),
            this.RootDescriptor(prefix))
        this.stores.set(location, created)
        return created
    }

    private PrefixFor(location: string): string
    {
        const sep = GcsStorageProviderRegistry.Separator
        const parts = [this.basePrefix, location].join(sep).split(sep).filter(p => p.length > 0)
        return parts.length === 0 ? '' : parts.join(sep) + sep
    }

    private RootDescriptor(prefix: string): string
    {
        return GcsStorageProviderRegistry.RootScheme + this.bucketName + GcsStorageProviderRegistry.Separator + prefix
    }
}
