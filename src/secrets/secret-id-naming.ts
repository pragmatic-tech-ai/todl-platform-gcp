import { SecretRefEncoding } from './secret-ref-encoding.js'

/** Maps an ISecretStore reference to the Secret Manager secret id it is stored under. */
export interface ISecretIdNaming
{
    IdFor(reference: string): string
}

/** The default: any reference, encoded injectively as `r-<base64url>` (see SecretRefEncoding). */
export class EncodedSecretIdNaming implements ISecretIdNaming
{
    public IdFor(reference: string): string
    {
        return SecretRefEncoding.ToSecretId(reference)
    }
}

/** References that already are readable, valid Secret Manager ids (e.g. `mvp--frontdoor--caddy--cf-api-token`)
 *  are used as-is, so operators see the same name in the console. Anything else is rejected, never encoded. */
export class VerbatimSecretIdNaming implements ISecretIdNaming
{
    private static readonly ValidId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,254}$/
    private static readonly InvalidMessage = 'Secret reference is not a valid Secret Manager id'

    public IdFor(reference: string): string
    {
        if (!VerbatimSecretIdNaming.ValidId.test(reference))
        {
            throw new Error(VerbatimSecretIdNaming.InvalidMessage)
        }
        return reference
    }
}
