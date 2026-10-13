import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { credentials } from '@grpc/grpc-js'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import type { ISecretStore } from '@pragmatic-tech-ai/todl-identity'
import { GcpSecretManagerSecretStore } from '../gcp-secret-manager-secret-store.js'
import { RealSecretManagerClient } from '../real-secret-manager-client.js'

/** Gated: runs store-level conformance against the real SDK + RealSecretManagerClient pointed at a plaintext
 *  gRPC Secret Manager endpoint (emulator). Skips unless PRAGMATIC_TEST_GCP_SECRET_ENDPOINT is set. */
class LiveSecretManagerConformance
{
    private static readonly EndpointVar = 'PRAGMATIC_TEST_GCP_SECRET_ENDPOINT'
    private static readonly ProjectVar = 'PRAGMATIC_TEST_GCP_PROJECT'
    private static readonly DefaultProject = 'test-project'
    private static readonly SkipReason = 'set PRAGMATIC_TEST_GCP_SECRET_ENDPOINT to run'
    private static readonly RunPrefix = 'run-'
    private static readonly Separator = '/'
    private static readonly SchemePattern = /^[a-z][a-z0-9+.-]*:\/\//i
    private static readonly TrailingSlashPattern = /\/+$/
    private static readonly Empty = ''
    private static readonly PortSeparator = ':'
    private static readonly DefaultPort = 443
    private static readonly AbsentName = 'absent'
    private static readonly RoundTripName = 'roundtrip'
    private static readonly OverwriteName = 'overwrite'
    private static readonly DeleteName = 'delete'
    private static readonly DeleteMissingName = 'delete-missing'
    private static readonly Utf8Name = 'utf8'
    private static readonly ValueA = 'value-a'
    private static readonly ValueB = 'value-b'
    private static readonly MultilineValue = 'line1\nline2\r\nline3\té中文😀\n'

    private readonly endpoint: string | undefined = process.env[LiveSecretManagerConformance.EndpointVar]
    private readonly project: string = process.env[LiveSecretManagerConformance.ProjectVar] ?? LiveSecretManagerConformance.DefaultProject
    private readonly runId: string = LiveSecretManagerConformance.RunPrefix + randomBytes(8).toString('hex')
    private readonly created: string[] = []
    private store: ISecretStore | undefined

    public Register(): void
    {
        const cases: Array<[string, () => Promise<void>]> = [
            ['Get of an absent reference returns null', () => this.Absent()],
            ['Put then Get round-trips', () => this.RoundTrip()],
            ['a second Put overwrites the value', () => this.Overwrite()],
            ['Delete then Get returns null', () => this.DeleteThenGet()],
            ['Delete of a missing reference is a no-op', () => this.DeleteMissing()],
            ['a newline / utf-8 value round-trips', () => this.Utf8()]
        ]
        const skip = this.endpoint === undefined ? LiveSecretManagerConformance.SkipReason : false
        for (const [name, body] of cases)
        {
            test(name, { skip }, async () =>
            {
                let bodyError: unknown
                try
                {
                    await body()
                }
                catch (error)
                {
                    bodyError = error
                }
                try
                {
                    await this.CleanUp()
                }
                catch (cleanupError)
                {
                    // Never let a cleanup failure mask a real assertion error; surface it only on a clean body.
                    if (bodyError === undefined)
                    {
                        bodyError = cleanupError
                    }
                }
                if (bodyError !== undefined)
                {
                    throw bodyError
                }
            })
        }
    }

    private async Absent(): Promise<void>
    {
        const store = this.Store()
        assert.equal(await store.Get(this.Ref(LiveSecretManagerConformance.AbsentName)), null)
    }

    private async RoundTrip(): Promise<void>
    {
        const store = this.Store()
        const ref = this.Ref(LiveSecretManagerConformance.RoundTripName)
        await store.Put(ref, LiveSecretManagerConformance.ValueA)
        assert.equal(await store.Get(ref), LiveSecretManagerConformance.ValueA)
    }

    private async Overwrite(): Promise<void>
    {
        const store = this.Store()
        const ref = this.Ref(LiveSecretManagerConformance.OverwriteName)
        await store.Put(ref, LiveSecretManagerConformance.ValueA)
        await store.Put(ref, LiveSecretManagerConformance.ValueB)
        assert.equal(await store.Get(ref), LiveSecretManagerConformance.ValueB)
    }

    private async DeleteThenGet(): Promise<void>
    {
        const store = this.Store()
        const ref = this.Ref(LiveSecretManagerConformance.DeleteName)
        await store.Put(ref, LiveSecretManagerConformance.ValueA)
        await store.Delete(ref)
        assert.equal(await store.Get(ref), null)
    }

    private async DeleteMissing(): Promise<void>
    {
        const store = this.Store()
        await store.Delete(this.Ref(LiveSecretManagerConformance.DeleteMissingName))
    }

    private async Utf8(): Promise<void>
    {
        const store = this.Store()
        const ref = this.Ref(LiveSecretManagerConformance.Utf8Name)
        await store.Put(ref, LiveSecretManagerConformance.MultilineValue)
        assert.equal(await store.Get(ref), LiveSecretManagerConformance.MultilineValue)
    }

    /** Unique per run so a shared emulator/project cannot collide; recorded for cleanup. */
    private Ref(name: string): string
    {
        const ref = this.runId + LiveSecretManagerConformance.Separator + name
        this.created.push(ref)
        return ref
    }

    /** Lazily built so a skipped run never constructs the SDK client. */
    private Store(): ISecretStore
    {
        if (this.store === undefined)
        {
            const target = this.ParseEndpoint(this.endpoint ?? LiveSecretManagerConformance.Empty)
            const client = new SecretManagerServiceClient({
                apiEndpoint: target.host,
                port: target.port,
                sslCreds: credentials.createInsecure()
            })
            this.store = new GcpSecretManagerSecretStore(new RealSecretManagerClient(client, this.project))
        }
        return this.store
    }

    private ParseEndpoint(endpoint: string): { host: string, port: number }
    {
        const bare = endpoint
            .replace(LiveSecretManagerConformance.SchemePattern, LiveSecretManagerConformance.Empty)
            .replace(LiveSecretManagerConformance.TrailingSlashPattern, LiveSecretManagerConformance.Empty)
        const at = bare.lastIndexOf(LiveSecretManagerConformance.PortSeparator)
        if (at < 0)
        {
            return { host: bare, port: LiveSecretManagerConformance.DefaultPort }
        }
        return { host: bare.slice(0, at), port: Number(bare.slice(at + 1)) }
    }

    /** Best-effort: delete every created ref even if one deletion fails; rethrow the first failure afterwards. */
    private async CleanUp(): Promise<void>
    {
        const refs = this.created.splice(0)
        if (this.store === undefined)
        {
            return
        }
        let first: unknown
        for (const ref of refs)
        {
            try
            {
                await this.store.Delete(ref)
            }
            catch (error)
            {
                first ??= error
            }
        }
        if (first !== undefined)
        {
            throw first
        }
    }
}

new LiveSecretManagerConformance().Register()
