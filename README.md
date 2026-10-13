# todl-platform-gcp

GCP-backed platform adapters: `GcsObjectStore` (an `IStorage` over Google Cloud Storage via the narrow
`IGcsBucket` seam) and `GcsStorageProviderRegistry`.

## Tests

`npm test` runs everything with no Docker. The fake-backed conformance suite always runs; the live
conformance test is gated on `PRAGMATIC_TEST_GCS_ENDPOINT` and skips cleanly when it is unset.

Both drive the same shared suite (`src/testing/istorage-conformance.ts`), so the real
`@google-cloud/storage` client and `RealGcsBucket` are held to the same behaviour as the in-memory fake.

## Running the gated emulator test

```
docker compose -f docker-compose.emulators.yml up -d
PRAGMATIC_TEST_GCS_ENDPOINT=http://localhost:4443 npx tsx --test src/storage/tests/gcs-object-store-live.test.ts
docker compose -f docker-compose.emulators.yml down
```

The compose file starts `fsouza/fake-gcs-server` over plain HTTP on port 4443 and pre-creates the
`pragmatic-test` bucket by mounting `docker/gcs-seed` (each top-level directory there becomes a bucket).
Set `PRAGMATIC_TEST_GCS_BUCKET` to target a different bucket. Each case writes under its own random
`run-<id>/` key prefix and deletes it afterwards.
