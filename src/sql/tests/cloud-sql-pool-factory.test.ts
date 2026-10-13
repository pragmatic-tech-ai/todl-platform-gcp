import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AuthTypes, IpAddressTypes } from '@google-cloud/cloud-sql-connector'
import { CloudSqlPoolFactory } from '../cloud-sql-pool-factory.js'
import type { ICloudSqlConnector, ICloudSqlPool } from '../cloud-sql-pool-factory.js'

class PoolFactoryFixture
{
    public static readonly Instance = 'proj:region:inst'
    public static readonly User = 'svc@proj.iam'
    public static readonly Database = 'pragmatic'
    public static readonly Stream = 'stream-marker'

    public readonly Events: string[] = []
    public GetOptionsArg: unknown
    public PoolConfig: Record<string, unknown> = {}

    public Make(extra: Record<string, unknown> = {}): CloudSqlPoolFactory
    {
        const connector: ICloudSqlConnector = {
            getOptions: async (opts: unknown) =>
            {
                this.GetOptionsArg = opts
                return { stream: PoolFactoryFixture.Stream }
            },
            close: () => { this.Events.push('connector.close') }
        }
        const pool: ICloudSqlPool = {
            end: async () => { this.Events.push('pool.end') }
        }
        return new CloudSqlPoolFactory(
            { instanceConnectionName: PoolFactoryFixture.Instance, user: PoolFactoryFixture.User, database: PoolFactoryFixture.Database, ...extra },
            () => connector,
            (cfg: Record<string, unknown>) =>
            {
                this.PoolConfig = cfg
                return pool
            })
    }
}

test('Create asks the connector for options with configured instance, authType and ipType', async () =>
{
    const f = new PoolFactoryFixture()
    await f.Make({ authType: AuthTypes.PASSWORD, ipType: IpAddressTypes.PRIVATE, password: 'pw' }).Create()
    assert.deepEqual(f.GetOptionsArg, {
        instanceConnectionName: PoolFactoryFixture.Instance,
        ipType: IpAddressTypes.PRIVATE,
        authType: AuthTypes.PASSWORD
    })
    assert.equal(f.PoolConfig.password, 'pw')
})

test('Create defaults to IAM auth over PUBLIC ip and builds the pool with options + user + database', async () =>
{
    const f = new PoolFactoryFixture()
    await f.Make().Create()
    const arg = f.GetOptionsArg as { authType: string, ipType: string }
    assert.equal(arg.authType, AuthTypes.IAM)
    assert.equal(arg.ipType, IpAddressTypes.PUBLIC)
    assert.equal(f.PoolConfig.stream, PoolFactoryFixture.Stream)
    assert.equal(f.PoolConfig.user, PoolFactoryFixture.User)
    assert.equal(f.PoolConfig.database, PoolFactoryFixture.Database)
    assert.equal(typeof f.PoolConfig.max, 'number')
    assert.equal('password' in f.PoolConfig, false)
})

test('Dispose ends the pool THEN closes the connector', async () =>
{
    const f = new PoolFactoryFixture()
    const sql = await f.Make().Create()
    await sql.Dispose()
    assert.deepEqual(f.Events, ['pool.end', 'connector.close'])
})
