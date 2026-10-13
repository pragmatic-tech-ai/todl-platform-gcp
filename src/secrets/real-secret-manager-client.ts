import type { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import type { ISecretManagerClient } from './secret-manager-client.js'

/** ISecretManagerClient over the real @google-cloud/secret-manager SDK client. Maps gRPC NOT_FOUND to
 *  "absent" and ALREADY_EXISTS on create to a no-op; everything else propagates. Logs nothing. */
export class RealSecretManagerClient implements ISecretManagerClient
{
    private static readonly GrpcNotFound = 5
    private static readonly GrpcAlreadyExists = 6
    private static readonly ProjectsPrefix = 'projects/'
    private static readonly SecretsSegment = '/secrets/'
    private static readonly LatestVersionSuffix = '/versions/latest'
    private static readonly Utf8 = 'utf8'
    private static readonly Replication = { automatic: {} }

    public constructor(
        private readonly client: SecretManagerServiceClient,
        private readonly projectId: string)
    {
    }

    public async AccessLatest(secretId: string): Promise<string | undefined>
    {
        try
        {
            const [version] = await this.client.accessSecretVersion({
                name: this.SecretPath(secretId) + RealSecretManagerClient.LatestVersionSuffix
            })
            const data = version.payload?.data
            if (data === null || data === undefined)
            {
                return undefined
            }
            return typeof data === 'string' ? data : Buffer.from(data).toString(RealSecretManagerClient.Utf8)
        }
        catch (e)
        {
            if (this.CodeOf(e) === RealSecretManagerClient.GrpcNotFound)
            {
                return undefined
            }
            throw e
        }
    }

    public async EnsureSecret(secretId: string): Promise<void>
    {
        try
        {
            await this.client.createSecret({
                parent: RealSecretManagerClient.ProjectsPrefix + this.projectId,
                secretId,
                secret: { replication: RealSecretManagerClient.Replication }
            })
        }
        catch (e)
        {
            if (this.CodeOf(e) === RealSecretManagerClient.GrpcAlreadyExists)
            {
                return
            }
            throw e
        }
    }

    public async AddVersion(secretId: string, value: string): Promise<void>
    {
        await this.client.addSecretVersion({
            parent: this.SecretPath(secretId),
            payload: { data: Buffer.from(value, RealSecretManagerClient.Utf8) }
        })
    }

    public async DeleteSecret(secretId: string): Promise<void>
    {
        try
        {
            await this.client.deleteSecret({ name: this.SecretPath(secretId) })
        }
        catch (e)
        {
            if (this.CodeOf(e) === RealSecretManagerClient.GrpcNotFound)
            {
                return
            }
            throw e
        }
    }

    private SecretPath(secretId: string): string
    {
        return RealSecretManagerClient.ProjectsPrefix + this.projectId + RealSecretManagerClient.SecretsSegment + secretId
    }

    private CodeOf(e: unknown): number | undefined
    {
        const code = (e as { code?: unknown } | null | undefined)?.code
        return typeof code === 'number' ? code : undefined
    }
}
