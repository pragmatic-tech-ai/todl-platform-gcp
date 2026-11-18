import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EncodedSecretIdNaming, VerbatimSecretIdNaming } from '../secret-id-naming.js'
import { SecretRefEncoding } from '../secret-ref-encoding.js'
import { GcpSecretManagerSecretStore } from '../gcp-secret-manager-secret-store.js'
import { FakeSecretManagerClient } from '../../testing/fake-secret-manager-client.js'

class NamingFixture
{
    public static readonly ReadableId = 'mvp--frontdoor--caddy--cf-api-token'
    public static readonly Slash = 'a/b'
    public static readonly LeadingDash = '-x'
    public static readonly Empty = ''
    public static readonly Value = 'v'
}

class RecordingClient extends FakeSecretManagerClient
{
    public readonly Accessed: string[] = []

    public override async AccessLatest(secretId: string): Promise<string | undefined>
    {
        this.Accessed.push(secretId)
        return super.AccessLatest(secretId)
    }
}

test('verbatim naming returns a valid readable id unchanged', () =>
{
    assert.equal(new VerbatimSecretIdNaming().IdFor(NamingFixture.ReadableId), NamingFixture.ReadableId)
})

test('verbatim naming rejects a slash, a leading dash, an empty id and a 256-character id', () =>
{
    const naming = new VerbatimSecretIdNaming()
    for (const bad of [NamingFixture.Slash, NamingFixture.LeadingDash, NamingFixture.Empty, 'a'.repeat(256)])
    {
        assert.throws(() => naming.IdFor(bad), /Secret reference is not a valid Secret Manager id/)
    }
})

test('verbatim naming accepts a 255-character id', () =>
{
    const id = 'a'.repeat(255)
    assert.equal(new VerbatimSecretIdNaming().IdFor(id), id)
})

test('encoded naming matches the existing reference encoding', () =>
{
    assert.equal(new EncodedSecretIdNaming().IdFor('x'), SecretRefEncoding.ToSecretId('x'))
    assert.equal(new EncodedSecretIdNaming().IdFor(NamingFixture.Slash), SecretRefEncoding.ToSecretId(NamingFixture.Slash))
})

test('a store with verbatim naming accesses the verbatim id and round-trips', async () =>
{
    const client = new RecordingClient()
    const store = new GcpSecretManagerSecretStore(client, new VerbatimSecretIdNaming())
    await store.Put(NamingFixture.ReadableId, NamingFixture.Value)
    assert.equal(await store.Get(NamingFixture.ReadableId), NamingFixture.Value)
    assert.deepEqual(client.Accessed, [NamingFixture.ReadableId])
})

test('a store without naming keeps the encoded ids', async () =>
{
    const client = new RecordingClient()
    const store = new GcpSecretManagerSecretStore(client)
    await store.Get(NamingFixture.Slash)
    assert.deepEqual(client.Accessed, [SecretRefEncoding.ToSecretId(NamingFixture.Slash)])
})
