import { GcsObjectStore } from '../gcs-object-store.js'
import { FakeGcsBucket } from '../../testing/fake-gcs-bucket.js'
import { IStorageConformance } from '../../testing/istorage-conformance.js'

class FakeGcsConformance
{
    private static readonly Descriptor = 'object://bucket'

    public static Register(): void
    {
        IStorageConformance.Run(() => new GcsObjectStore(new FakeGcsBucket(), FakeGcsConformance.Descriptor), {
            AssertCapabilityOmission: true,
            ExpectedRoot: FakeGcsConformance.Descriptor,
            Skip: false
        })
    }
}

FakeGcsConformance.Register()
