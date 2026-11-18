import type { ISecretStore } from '@pragmatic-tech-ai/todl-identity'
import type { ISecretManagerClient } from './secret-manager-client.js'
import { EncodedSecretIdNaming, type ISecretIdNaming } from './secret-id-naming.js'

/** ISecretStore over GCP Secret Manager via an injected client seam. Absence is null (Get) / no-op (Delete). */
export class GcpSecretManagerSecretStore implements ISecretStore
{
    private readonly client: ISecretManagerClient
    private readonly naming: ISecretIdNaming

    public constructor(client: ISecretManagerClient, naming: ISecretIdNaming = new EncodedSecretIdNaming())
    {
        this.client = client
        this.naming = naming
    }

    public async Get(reference: string): Promise<string | null>
    {
        const value = await this.client.AccessLatest(this.naming.IdFor(reference))
        return value ?? null
    }

    public async Put(reference: string, secret: string): Promise<void>
    {
        const id = this.naming.IdFor(reference)
        await this.client.EnsureSecret(id)
        await this.client.AddVersion(id, secret)
    }

    public async Delete(reference: string): Promise<void>
    {
        await this.client.DeleteSecret(this.naming.IdFor(reference))
    }
}
