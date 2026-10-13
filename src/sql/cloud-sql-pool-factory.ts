import { AuthTypes, Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector'
import pg from 'pg'

/** The slice of the Cloud SQL Connector this factory uses (injectable for tests). */
export interface ICloudSqlConnector
{
    getOptions(opts: { instanceConnectionName: string, ipType: IpAddressTypes, authType: AuthTypes }): Promise<object>
    close(): void
}

/** The slice of pg.Pool this factory needs to tear down. */
export interface ICloudSqlPool
{
    end(): Promise<void>
}

export interface ICloudSqlPoolOptions
{
    instanceConnectionName: string
    user: string
    database: string
    ipType?: IpAddressTypes
    authType?: AuthTypes
    /** Already-resolved password; only meaningful with PASSWORD auth. This factory never reads a secret. */
    password?: string
}

export interface ICloudSqlPoolHandle
{
    Pool: pg.Pool
    Dispose(): Promise<void>
}

/** Builds a pg.Pool over the Cloud SQL Connector. Dispose ends the pool FIRST, then closes the connector. */
export class CloudSqlPoolFactory
{
    private static readonly MaxConnections = 10
    private static readonly DefaultIpType = IpAddressTypes.PUBLIC
    private static readonly DefaultAuthType = AuthTypes.IAM

    public constructor(
        private readonly options: ICloudSqlPoolOptions,
        private readonly createConnector: () => ICloudSqlConnector = () => new Connector() as unknown as ICloudSqlConnector,
        private readonly createPool: (cfg: Record<string, unknown>) => ICloudSqlPool = cfg => new pg.Pool(cfg))
    {
    }

    public async Create(): Promise<ICloudSqlPoolHandle>
    {
        const authType = this.options.authType ?? CloudSqlPoolFactory.DefaultAuthType
        const connector = this.createConnector()
        const driverOptions = await connector.getOptions({
            instanceConnectionName: this.options.instanceConnectionName,
            ipType: this.options.ipType ?? CloudSqlPoolFactory.DefaultIpType,
            authType
        })
        const cfg: Record<string, unknown> = {
            ...driverOptions,
            user: this.options.user,
            database: this.options.database,
            max: CloudSqlPoolFactory.MaxConnections
        }
        if (authType === AuthTypes.PASSWORD && this.options.password !== undefined)
        {
            cfg.password = this.options.password
        }
        const pool = this.createPool(cfg)
        return {
            Pool: pool as pg.Pool,
            Dispose: async () =>
            {
                await pool.end()
                connector.close()
            }
        }
    }
}
