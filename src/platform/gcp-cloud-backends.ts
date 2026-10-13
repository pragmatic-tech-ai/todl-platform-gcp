import { AuthTypes, IpAddressTypes } from '@google-cloud/cloud-sql-connector'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { Storage } from '@google-cloud/storage'
import type { ISqlSession, IStorageProviderRegistry } from '@pragmatic-tech-ai/todl'
import type { ISecretStore } from '@pragmatic-tech-ai/todl-identity'
import { PgSession } from '@pragmatic-tech-ai/todl-platform-cloud'
import { GcpSecretManagerSecretStore } from '../secrets/gcp-secret-manager-secret-store.js'
import { RealSecretManagerClient } from '../secrets/real-secret-manager-client.js'
import { CloudSqlPoolFactory } from '../sql/cloud-sql-pool-factory.js'
import type { ICloudSqlPoolHandle } from '../sql/cloud-sql-pool-factory.js'
import { GcsStorageProviderRegistry } from '../storage/gcs-storage-provider-registry.js'

export interface IGcpCloudBackendsConfig
{
    gcsBucket: string
    gcsPrefix?: string
    gcpProject: string
    cloudSqlInstance: string
    cloudSqlUser: string
    cloudSqlDatabase: string
    cloudSqlIpType?: string
    cloudSqlAuth?: string
}

/** Injectable SDK/pool construction (defaults build the real clients). */
export interface IGcpCloudBackendsFactories
{
    CreateStorageClient(projectId: string): Storage
    CreateSecretManagerClient(): SecretManagerServiceClient
    CreatePool(config: IGcpCloudBackendsConfig): Promise<ICloudSqlPoolHandle>
}

/** GCS storage + Secret Manager + Cloud SQL session, assembled from config. Owns the pool/connector lifecycle. */
export class GcpCloudBackends
{
    private static readonly InvalidIpType = 'Invalid cloudSqlIpType'
    private static readonly InvalidAuth = 'Invalid cloudSqlAuth'

    private static readonly DefaultFactories: IGcpCloudBackendsFactories = {
        CreateStorageClient: projectId => new Storage({ projectId }),
        CreateSecretManagerClient: () => new SecretManagerServiceClient(),
        CreatePool: config => new CloudSqlPoolFactory({
            instanceConnectionName: config.cloudSqlInstance,
            user: config.cloudSqlUser,
            database: config.cloudSqlDatabase,
            ipType: GcpCloudBackends.ParseIpType(config.cloudSqlIpType),
            authType: GcpCloudBackends.ParseAuth(config.cloudSqlAuth)
        }).Create()
    }

    private constructor(
        public readonly Storage: IStorageProviderRegistry,
        public readonly SecretManager: ISecretStore,
        public readonly Session: ISqlSession,
        private readonly sql: ICloudSqlPoolHandle)
    {
    }

    public static async Create(
        config: IGcpCloudBackendsConfig,
        factories: IGcpCloudBackendsFactories = GcpCloudBackends.DefaultFactories): Promise<GcpCloudBackends>
    {
        const storage = new GcsStorageProviderRegistry(
            factories.CreateStorageClient(config.gcpProject), config.gcsBucket, config.gcsPrefix ?? '')
        const secretManager = new GcpSecretManagerSecretStore(
            new RealSecretManagerClient(factories.CreateSecretManagerClient(), config.gcpProject))
        const sql = await factories.CreatePool(config)
        return new GcpCloudBackends(storage, secretManager, new PgSession(sql.Pool), sql)
    }

    /** Closes the pool then the connector, once. Deliberately does NOT also call Session.Dispose()
     *  (PgSession.Dispose also ends the pool: calling both would double-close it). */
    public async Dispose(): Promise<void>
    {
        await this.sql.Dispose()
    }

    private static ParseIpType(value: string | undefined): IpAddressTypes | undefined
    {
        if (value === undefined)
        {
            return undefined
        }
        const found = Object.values(IpAddressTypes).find(v => v === value.toUpperCase())
        if (found === undefined)
        {
            throw new Error(GcpCloudBackends.InvalidIpType)
        }
        return found
    }

    private static ParseAuth(value: string | undefined): AuthTypes | undefined
    {
        if (value === undefined)
        {
            return undefined
        }
        const found = Object.values(AuthTypes).find(v => v === value.toUpperCase())
        if (found === undefined)
        {
            throw new Error(GcpCloudBackends.InvalidAuth)
        }
        return found
    }
}
