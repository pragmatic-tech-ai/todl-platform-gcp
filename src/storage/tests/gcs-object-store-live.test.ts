import { randomBytes } from 'node:crypto'
import { Storage } from '@google-cloud/storage'
import { GcsObjectStore } from '../gcs-object-store.js'
import { RealGcsBucket } from '../real-gcs-bucket.js'
import { IStorageConformance } from '../../testing/istorage-conformance.js'

/** Gated: runs the shared IStorage conformance suite against the real SDK + RealGcsBucket pointed at a
 *  fake-gcs-server emulator. Skips unless PRAGMATIC_TEST_GCS_ENDPOINT is set. */
class LiveGcsConformance
{
    private static readonly EndpointVar = 'PRAGMATIC_TEST_GCS_ENDPOINT'
    private static readonly BucketVar = 'PRAGMATIC_TEST_GCS_BUCKET'
    private static readonly DefaultBucket = 'pragmatic-test'
    private static readonly ProjectId = 'test'
    private static readonly Descriptor = 'object://bucket'
    private static readonly RunPrefix = 'run-'
    private static readonly Separator = '/'
    private static readonly SkipReason = 'set PRAGMATIC_TEST_GCS_ENDPOINT to run'

    private readonly endpoint: string | undefined = process.env[LiveGcsConformance.EndpointVar]
    private readonly bucketName: string = process.env[LiveGcsConformance.BucketVar] ?? LiveGcsConformance.DefaultBucket
    private readonly prefixes: string[] = []
    private storage: Storage | undefined

    public Register(): void
    {
        IStorageConformance.Run(() => this.MakeStore(), {
            AssertCapabilityOmission: true,
            ExpectedRoot: LiveGcsConformance.Descriptor,
            Skip: this.endpoint === undefined ? LiveGcsConformance.SkipReason : false,
            Cleanup: () => this.CleanUp()
        })
    }

    private MakeStore(): GcsObjectStore
    {
        this.storage ??= new Storage({ apiEndpoint: this.endpoint, projectId: LiveGcsConformance.ProjectId })
        const prefix = LiveGcsConformance.RunPrefix + randomBytes(8).toString('hex') + LiveGcsConformance.Separator
        this.prefixes.push(prefix)
        return new GcsObjectStore(new RealGcsBucket(this.storage.bucket(this.bucketName), prefix), LiveGcsConformance.Descriptor)
    }

    private async CleanUp(): Promise<void>
    {
        const storage = this.storage
        const prefixes = this.prefixes.splice(0)
        if (storage === undefined)
        {
            return
        }
        for (const prefix of prefixes)
        {
            await storage.bucket(this.bucketName).deleteFiles({ prefix })
        }
    }
}

new LiveGcsConformance().Register()
