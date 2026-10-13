import { credentials } from '@grpc/grpc-js'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { Storage } from '@google-cloud/storage'
import type { IGcpCloudBackendsConfig, IGcpCloudBackendsFactories } from '../platform/gcp-cloud-backends.js'
import type { ICloudSqlPoolHandle } from '../sql/cloud-sql-pool-factory.js'

export interface IGcpEmulatorOptions
{
    /** fake-gcs-server base URL, e.g. http://localhost:4443 */
    gcsEndpoint: string
    /** plaintext gRPC Secret Manager emulator, host:port or http://host:port */
    secretEndpoint: string
    /** supplies the SQL pool (there is no Cloud SQL emulator; tests pass a plain local pg pool) */
    CreatePool(config: IGcpCloudBackendsConfig): Promise<ICloudSqlPoolHandle>
}

/** Test helper: GcpCloudBackends factories that point the real SDK clients at local emulators, so
 *  consumers can exercise the real backend wiring without importing the @google-cloud SDKs themselves. */
export class GcpEmulatorFactories
{
    private static readonly SchemePattern = /^[a-z][a-z0-9+.-]*:\/\//i
    private static readonly TrailingSlashPattern = /\/+$/
    private static readonly Empty = ''
    private static readonly PortSeparator = ':'
    private static readonly DefaultPort = 443

    public static ForTest(options: IGcpEmulatorOptions): IGcpCloudBackendsFactories
    {
        const secret = GcpEmulatorFactories.ParseEndpoint(options.secretEndpoint)
        return {
            CreateStorageClient: projectId => new Storage({ apiEndpoint: options.gcsEndpoint, projectId }),
            CreateSecretManagerClient: () => new SecretManagerServiceClient({ apiEndpoint: secret.host, port: secret.port, sslCreds: credentials.createInsecure() }),
            CreatePool: config => options.CreatePool(config),
        }
    }

    private static ParseEndpoint(endpoint: string): { host: string, port: number }
    {
        const bare = endpoint
            .replace(GcpEmulatorFactories.SchemePattern, GcpEmulatorFactories.Empty)
            .replace(GcpEmulatorFactories.TrailingSlashPattern, GcpEmulatorFactories.Empty)
        const at = bare.lastIndexOf(GcpEmulatorFactories.PortSeparator)
        if (at < 0)
        {
            return { host: bare, port: GcpEmulatorFactories.DefaultPort }
        }
        return { host: bare.slice(0, at), port: Number(bare.slice(at + 1)) }
    }
}
