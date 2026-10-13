/** The narrow subset of a cloud object bucket the GCS object store needs. Injected so the store is
 *  unit-testable against a fake and integration-tested against fake-gcs-server. Keys are full object
 *  names (already prefixed); byte payloads are raw. */
export interface IGcsBucket
{
    Save(key: string, bytes: Uint8Array): Promise<void>
    Download(key: string): Promise<Uint8Array | undefined>
    Delete(key: string): Promise<void>
    ListKeys(): Promise<readonly string[]>
}
