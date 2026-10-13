import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Storage } from '@google-cloud/storage'
import { GcsStorageProviderRegistry } from '../gcs-storage-provider-registry.js'

/** Minimal structural fake of the SDK surface RealGcsBucket uses, routed into one in-memory map keyed by full name. */
class FakeSdkStorage
{
    public readonly Objects = new Map<string, Buffer>()

    public bucket(_name: string)
    {
        return {
            file: (name: string) => ({
                save: async (data: Buffer) => { this.Objects.set(name, Buffer.from(data)) },
                download: async (): Promise<[Buffer]> =>
                {
                    const found = this.Objects.get(name)
                    if (found === undefined)
                    {
                        throw Object.assign(new Error('No such object'), { code: 404 })
                    }
                    return [found]
                },
                delete: async () => { this.Objects.delete(name) }
            }),
            getFiles: async (query: { prefix: string }) =>
                [[...this.Objects.keys()].filter(k => k.startsWith(query.prefix)).map(name => ({ name }))]
        }
    }
}

class Fixture
{
    public readonly Sdk = new FakeSdkStorage()
    public readonly Registry = new GcsStorageProviderRegistry(this.Sdk as unknown as Storage, 'bkt', 'base/')
}

test('a repeated location returns the same cached store and shares state', async () =>
{
    const f = new Fixture()
    const a = f.Registry.CreateStorage('loc1')
    assert.equal(f.Registry.CreateStorage('loc1'), a)
    await a.WriteText('x.txt', 'hello')
    assert.equal(await f.Registry.CreateStorage('loc1').ReadText('x.txt'), 'hello')
    assert.ok(f.Sdk.Objects.has('base/loc1/x.txt'))
})

test('different locations are isolated by prefix', async () =>
{
    const f = new Fixture()
    const a = f.Registry.CreateStorage('loc1')
    const b = f.Registry.CreateStorage('loc2')
    assert.notEqual(a, b)
    await a.WriteText('x.txt', 'hello')
    await assert.rejects(() => b.ReadText('x.txt'), /ENOENT/)
    assert.deepEqual([...f.Sdk.Objects.keys()], ['base/loc1/x.txt'])
})
