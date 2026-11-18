import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { RealSecretManagerClient } from '../real-secret-manager-client.js'

class StubSdk
{
    public readonly Calls: { method: string, request: any }[] = []
    public AccessResult: any = undefined
    public Failure: unknown = undefined

    public async accessSecretVersion(request: any): Promise<any>
    {
        return this.Run('accessSecretVersion', request, this.AccessResult)
    }

    public async createSecret(request: any): Promise<any>
    {
        return this.Run('createSecret', request, [{}])
    }

    public async addSecretVersion(request: any): Promise<any>
    {
        return this.Run('addSecretVersion', request, [{}])
    }

    public async deleteSecret(request: any): Promise<any>
    {
        return this.Run('deleteSecret', request, [{}])
    }

    private Run(method: string, request: any, result: any): any
    {
        this.Calls.push({ method, request })
        if (this.Failure !== undefined)
        {
            throw this.Failure
        }
        return result
    }
}

class Fixture
{
    public readonly Sdk = new StubSdk()
    public readonly Client = new RealSecretManagerClient(this.Sdk as unknown as SecretManagerServiceClient, 'proj')
}

test('AccessLatest decodes a Buffer payload as utf-8 and targets the latest version', async () =>
{
    const f = new Fixture()
    f.Sdk.AccessResult = [{ payload: { data: Buffer.from('line1\nline2 é', 'utf8') } }]
    assert.equal(await f.Client.AccessLatest('s1'), 'line1\nline2 é')
    assert.equal(f.Sdk.Calls[0]!.request.name, 'projects/proj/secrets/s1/versions/latest')
})

test('AccessLatest returns a string payload as-is', async () =>
{
    const f = new Fixture()
    f.Sdk.AccessResult = [{ payload: { data: 'plain' } }]
    assert.equal(await f.Client.AccessLatest('s1'), 'plain')
})

test('AccessLatest returns undefined for a missing payload', async () =>
{
    const f = new Fixture()
    f.Sdk.AccessResult = [{}]
    assert.equal(await f.Client.AccessLatest('s1'), undefined)
})

test('AccessLatest maps NOT_FOUND to undefined and rethrows others', async () =>
{
    const f = new Fixture()
    f.Sdk.Failure = { code: 5 }
    assert.equal(await f.Client.AccessLatest('s1'), undefined)
    f.Sdk.Failure = { code: 7 }
    await assert.rejects(() => f.Client.AccessLatest('s1'))
})

test('EnsureSecret creates with automatic replication under the project parent', async () =>
{
    const f = new Fixture()
    await f.Client.EnsureSecret('s1')
    assert.deepEqual(f.Sdk.Calls[0]!.request, {
        parent: 'projects/proj',
        secretId: 's1',
        secret: { replication: { automatic: {} } }
    })
})

test('EnsureSecret swallows ALREADY_EXISTS and rethrows others', async () =>
{
    const f = new Fixture()
    f.Sdk.Failure = { code: 6 }
    await f.Client.EnsureSecret('s1')
    f.Sdk.Failure = { code: 7 }
    await assert.rejects(() => f.Client.EnsureSecret('s1'))
})

test('DeleteSecret swallows NOT_FOUND and rethrows others', async () =>
{
    const f = new Fixture()
    f.Sdk.Failure = { code: 5 }
    await f.Client.DeleteSecret('s1')
    assert.equal(f.Sdk.Calls[0]!.request.name, 'projects/proj/secrets/s1')
    f.Sdk.Failure = { code: 7 }
    await assert.rejects(() => f.Client.DeleteSecret('s1'))
})

test('AddVersion passes a utf-8 Buffer to the secret parent', async () =>
{
    const f = new Fixture()
    await f.Client.AddVersion('s1', 'va\nlue é')
    const req = f.Sdk.Calls[0]!.request
    assert.equal(req.parent, 'projects/proj/secrets/s1')
    assert.ok(Buffer.isBuffer(req.payload.data))
    assert.equal(req.payload.data.toString('utf8'), 'va\nlue é')
})

test('EnsureSecret with a replica location creates a single user-managed replica there', async () =>
{
    const sdk = new StubSdk()
    const client = new RealSecretManagerClient(sdk as unknown as SecretManagerServiceClient, 'proj', 'europe-west3')
    await client.EnsureSecret('s1')
    const replication = sdk.Calls[0]!.request.secret.replication
    assert.equal(replication.automatic, undefined)
    assert.equal(replication.userManaged.replicas.length, 1)
    assert.equal(replication.userManaged.replicas[0].location, 'europe-west3')
})
