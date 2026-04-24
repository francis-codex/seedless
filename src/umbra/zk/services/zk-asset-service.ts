import { Directory, File, Paths } from 'expo-file-system'
import { Asset } from 'expo-asset'
import {
  ZK_ASSETS_BASE_URL,
  ZK_ASSETS_DIRECTORY,
  ZK_MANIFEST_FILENAME,
  ZK_MANIFEST_URL,
  hasVariants
} from '../constants'
import type {
  ZKeyType,
  ClaimVariant,
  ZkAssetManifest,
  LocalZkManifest
} from '../types'

const BUNDLED_ZKEYS: Partial<Record<ZKeyType, number>> = {
  userRegistration: require('../../../../assets/zk/userregistration.zkey'),
  createDepositWithPublicAmount: require('../../../../assets/zk/createdepositwithpublicamount.zkey')
}

const rootDir = () => new Directory(Paths.document, ZK_ASSETS_DIRECTORY)
const zkDir = (version: string) => new Directory(rootDir(), version)
const manifestFile = () => new File(rootDir(), ZK_MANIFEST_FILENAME)

function getZKeyFileName(type: ZKeyType, variant?: ClaimVariant): string {
  return `${type.toLowerCase()}${variant ?? ''}.zkey`
}

function zkeyFile(
  type: ZKeyType,
  variant: ClaimVariant | undefined,
  version: string
): File {
  return new File(zkDir(version), getZKeyFileName(type, variant))
}

function manifestKey(type: ZKeyType, variant?: ClaimVariant): string {
  return variant ? `${type}:${variant}` : type
}

async function readLocalManifest(): Promise<LocalZkManifest | null> {
  const mFile = manifestFile()
  if (!mFile.exists) return null
  try {
    return JSON.parse(await mFile.text()) as LocalZkManifest
  } catch {
    return null
  }
}

async function writeLocalManifest(manifest: LocalZkManifest): Promise<void> {
  const root = rootDir()
  if (!root.exists) await root.create()
  await manifestFile().write(JSON.stringify(manifest))
}

async function saveAssetToManifest(
  type: ZKeyType,
  variant: ClaimVariant | undefined,
  version: string,
  localPath: string,
  manifestVersion?: string
): Promise<void> {
  const existing = await readLocalManifest()
  const manifest: LocalZkManifest = {
    manifestVersion: manifestVersion ?? existing?.manifestVersion ?? 'bundled',
    downloadedAt: Date.now(),
    assets: existing?.assets ?? {}
  }
  manifest.assets[manifestKey(type, variant)] = { version, localPath }
  await writeLocalManifest(manifest)
}

export async function fetchRemoteManifest(): Promise<ZkAssetManifest> {
  const url = `${ZK_MANIFEST_URL}?t=${Date.now()}`
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Failed to fetch ZK manifest: ${response.status}`)
  return response.json()
}

function getAssetEntry(
  manifest: ZkAssetManifest,
  type: ZKeyType,
  variant?: ClaimVariant
): { url: string; version: string } | null {
  const asset = manifest.assets[type]
  if (!asset) return null

  if (hasVariants(asset)) {
    if (!variant) throw new Error(`Variant required for ${type}`)
    const variantEntry = asset[variant]
    if (!variantEntry)
      throw new Error(`Variant ${variant} not found for ${type}`)
    return variantEntry
  }

  return asset
}

async function validateManifestVersion(): Promise<void> {
  const mFile = manifestFile()
  if (!mFile.exists) return

  try {
    const local = JSON.parse(await mFile.text()) as
      | LocalZkManifest
      | { cacheVersion?: number }

    if (
      !('manifestVersion' in local) ||
      typeof local.manifestVersion !== 'string'
    ) {
      console.log(
        '[ZK Assets] Local manifest missing manifestVersion (legacy format). Clearing cache...'
      )
      await clearZkAssetsCache()
      return
    }

    const remote = await fetchRemoteManifest()
    if (local.manifestVersion !== remote.version) {
      console.log(
        `[ZK Assets] Manifest version mismatch (local: ${local.manifestVersion}, remote: ${remote.version}). Clearing cache...`
      )
      await clearZkAssetsCache()
    }
  } catch {
    await clearZkAssetsCache()
  }
}

async function isRemoteVersionNewer(
  type: ZKeyType,
  variant: ClaimVariant | undefined,
  localVersion: string
): Promise<boolean> {
  try {
    const remote = await Promise.race([
      fetchRemoteManifest(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Manifest fetch timeout')), 5000)
      )
    ])
    const entry = getAssetEntry(remote, type, variant)
    return !!entry && localVersion !== entry.version
  } catch {
    return false
  }
}

async function getBundledZKeyUri(type: ZKeyType): Promise<string | null> {
  const moduleId = BUNDLED_ZKEYS[type]
  if (!moduleId) return null
  try {
    const asset = Asset.fromModule(moduleId)
    await asset.downloadAsync()
    if (!asset.localUri) return null
    const src = new File(asset.localUri.replace('file://', ''))
    if (!src.exists || src.size === 0) return null

    const dir = new Directory(rootDir(), 'bundled')
    const root = rootDir()
    if (!root.exists) await root.create()
    if (!dir.exists) await dir.create()
    const dest = new File(dir, getZKeyFileName(type))
    if (!dest.exists || dest.size === 0) {
      await src.copy(dest)
    }
    return dest.uri
  } catch {
    return null
  }
}

export async function isZKeyAvailable(
  type: ZKeyType,
  variant?: ClaimVariant
): Promise<boolean> {
  if (!variant && type in BUNDLED_ZKEYS) return true

  const manifest = await readLocalManifest()
  if (!manifest?.manifestVersion) return false
  return zkeyFile(type, variant, manifest.manifestVersion).exists
}

export async function downloadZKey(
  type: ZKeyType,
  variant?: ClaimVariant
): Promise<string> {
  const remoteManifest = await fetchRemoteManifest()
  const version = remoteManifest.version
  const dir = zkDir(version)
  const root = rootDir()
  if (!root.exists) await root.create()
  if (!dir.exists) await dir.create()

  const file = zkeyFile(type, variant, version)
  const entry = getAssetEntry(remoteManifest, type, variant)

  if (!entry)
    throw new Error(
      `Asset ${type}${variant ? ` (${variant})` : ''} not found in remote manifest`
    )

  const downloadUrl = entry.url.startsWith('http')
    ? entry.url
    : `${ZK_ASSETS_BASE_URL}/${entry.url}`

  if (!file.exists) {
    await File.downloadFileAsync(downloadUrl, file)
  }

  await saveAssetToManifest(type, variant, entry.version, file.uri, version)
  return file.uri
}

async function localOrDownloadZKey(
  type: ZKeyType,
  variant?: ClaimVariant
): Promise<string> {
  const bundledUri = await getBundledZKeyUri(type)
  if (bundledUri) {
    await saveAssetToManifest(type, undefined, 'bundled', bundledUri)
    return bundledUri
  }
  return downloadZKey(type, variant)
}

async function getCachedUri(
  type: ZKeyType,
  variant?: ClaimVariant
): Promise<string | null> {
  const manifest = await readLocalManifest()
  if (!manifest) return null

  const file = zkeyFile(type, variant, manifest.manifestVersion)
  if (!file.exists) return null

  const localAsset = manifest.assets[manifestKey(type, variant)]
  if (!localAsset) return null

  if (await isRemoteVersionNewer(type, variant, localAsset.version)) return null

  return file.uri
}

export async function getZKey(
  type: ZKeyType,
  variant?: ClaimVariant
): Promise<string> {
  await validateManifestVersion()

  const cached = await getCachedUri(type, variant)
  if (cached) return cached

  return localOrDownloadZKey(type, variant)
}

export async function clearZkAssetsCache(): Promise<void> {
  const dir = rootDir()
  if (dir.exists) await dir.delete()
}
