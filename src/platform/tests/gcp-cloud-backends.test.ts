import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newDb } from 'pg-mem'
import { GcpCloudBackends } from '../gcp-cloud-backends.js'
import type { IGcpCloudBackendsConfig } from '../gcp-cloud-backends.js'
import { GcsStorageProviderRegistry } from '../../storage/gcs-storage-provider-registry.js'
import { GcpSecretManagerSecretStore } from '../../secrets/gcp-secret-manager-secret-store.js'

class BackendsFixture
{
    public static readonly Config: IGcpCloudBackendsConfig = {
        gcsBucket: 'bkt',
        gcpProject: 'proj',
        cloudSqlInstance: 'proj:region:inst',
        cloudSqlUser: 'u',
        cloudSqlDatabase: 'd'
    }

    public SqlDisposeCalls = 0
    public PoolEndCalls = 0
    public ConfigSeen: unknown

    public async Make(): Promise<GcpCloudBackends>
    {
        const { Pool } = newDb().adapters.createPg()
        const pool = new Pool()
        const realEnd = pool.end.bind(pool)
        pool.end = async () =>
        {
            this.PoolEndCalls++
            await realEnd()
        }
        return GcpCloudBackends.Create(BackendsFixture.Config, {
            CreateStorageClient: () => ({}) as never,
            CreateSecretManagerClient: () => ({}) as never,
            CreatePool: async (cfg: unknown) =>
            {
                this.ConfigSeen = cfg
                return {
                    Pool: pool as never,
                    Dispose: async () =>
                    {
                        this.SqlDisposeCalls++
                        await pool.end()
                    }
                }
            }
        })
    }
}

test('Create wires storage, secret manager and a working SQL session from config', async () =>
{
    const f = new BackendsFixture()
    const b = await f.Make()
    assert.ok(b.Storage instanceof GcsStorageProviderRegistry)
    assert.ok(b.SecretManager instanceof GcpSecretManagerSecretStore)
    assert.deepEqual(f.ConfigSeen, BackendsFixture.Config)
    assert.ok(b.Session)
    await b.Dispose()
})

test('Dispose tears the pool and connector down exactly once (no double close)', async () =>
{
    const f = new BackendsFixture()
    const b = await f.Make()
    await b.Dispose()
    assert.equal(f.SqlDisposeCalls, 1)
    assert.equal(f.PoolEndCalls, 1)
})

