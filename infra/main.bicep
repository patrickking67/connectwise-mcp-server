metadata description = 'Azure Container Apps deployment for the ConnectWise MCP server (remote Streamable HTTP transport).'

// Deploys, into one resource group:
//
//   Log Analytics workspace      where container logs land
//   Container Apps environment   the compute
//   User-assigned managed identity   pulls the image, reads the secrets
//   Container registry           holds the image
//   Key Vault                    holds the ConnectWise credentials and the MCP token
//   Container App                the server itself
//
// Two deliberate choices worth knowing before you change them:
//
//  1. A USER-ASSIGNED identity, not a system-assigned one. Container Apps cannot
//     resolve a Key Vault secret reference with a system-assigned identity on the
//     first deployment, because that identity does not exist until after the app
//     is created. A user-assigned identity exists first, so the very first
//     revision starts with its secrets already readable.
//
//  2. Secrets are Key Vault REFERENCES, not literal values on the app. The
//     reference is version-less on purpose: Container Apps re-reads it
//     periodically, so rotating the credential in Key Vault does not require
//     redeploying this template.
//
// If your organisation already has a shared container registry, delete the
// `registry` resource below, pass its login server as `containerImage`, and grant
// this template's identity AcrPull on it instead.

targetScope = 'resourceGroup'

@description('Base name for every resource. Keep it short: the registry name is derived from it and Azure allows 5-50 alphanumeric characters there.')
@minLength(3)
@maxLength(20)
param name string = 'connectwise-mcp'

@description('Region for every resource. Defaults to the resource group\'s region.')
param location string = resourceGroup().location

@description('Fully qualified image reference, e.g. myregistry.azurecr.io/connectwise-mcp-server:0.2.0. The placeholder default lets the infrastructure deploy before the first image exists; the deploy workflow replaces it.')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('ConnectWise PSA public key of the API member.')
@secure()
param psaPublicKey string

@description('ConnectWise PSA private key.')
@secure()
param psaPrivateKey string

@description('ConnectWise developer clientId GUID, sent with every PSA request.')
@secure()
param psaClientId string

@description('Shared bearer token callers present to reach /mcp. Generate with: openssl rand -base64 48')
@secure()
param mcpAuthToken string

@description('ConnectWise Manage host, e.g. na.myconnectwise.net. The api- prefix is added by the app for cloud hosts.')
param psaSite string

@description('The company identifier you log in to ConnectWise with. Not a credential.')
param psaCompanyId string

@description('Automate URL, e.g. https://automate.example.com. Leave empty to register no Automate tools.')
param automateUrl string = ''

@description('Automate username. Required only when automateUrl is set.')
param automateUsername string = ''

@description('Automate password. Required only when automateUrl is set.')
@secure()
param automatePassword string = ''

@description('Automate developer clientId GUID. Required only when automateUrl is set.')
@secure()
param automateClientId string = ''

@description('Entra tenant id, to enable per-user authentication. Leave both Entra values empty to authenticate with the shared token alone.')
param entraTenantId string = ''

@description('Entra application (client) id of the app registration that exposes this server\'s API.')
param entraClientId string = ''

@description('Minimum replicas. 1 keeps a warm instance so the first tool call of the day is not a cold start; 0 costs nothing while idle and adds a few seconds to that first call.')
@minValue(0)
@maxValue(10)
param minReplicas int = 1

@description('Maximum replicas.')
@minValue(1)
@maxValue(30)
param maxReplicas int = 5

@description('Log retention in days.')
@minValue(30)
@maxValue(730)
param logRetentionDays int = 30

var resourceToken = uniqueString(resourceGroup().id, name)
var registryName = toLower(replace('${name}${resourceToken}', '-', ''))
var tags = {
  application: 'connectwise-mcp-server'
  'data-class': 'client-msp-data'
  managedBy: 'bicep'
}

// Built-in role definition ids. These are constant across every Azure tenant.
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-identity'
  location: location
  tags: tags
}

resource logs 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${name}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: logRetentionDays
    features: { enableLogAccessUsingOnlyResourcePermissions: true }
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    // Identity-based pulls only. An admin user is a shared password that cannot
    // be attributed to anyone and cannot be rotated without breaking every puller.
    adminUserEnabled: false
    anonymousPullEnabled: false
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    // RBAC rather than access policies: it is the current model, and it lets the
    // role assignment below be expressed in the same template as the identity.
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    // Recovering a deleted vault is the difference between a bad afternoon and a
    // credential-rotation incident across every client of this connector.
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
    networkAcls: { defaultAction: 'Allow', bypass: 'AzureServices' }
  }
}

resource psaPublicKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'psa-public-key'
  properties: { value: psaPublicKey }
}

resource psaPrivateKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'psa-private-key'
  properties: { value: psaPrivateKey }
}

resource psaClientIdSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'psa-client-id'
  properties: { value: psaClientId }
}

// Always created, so the app's secret list can reference them unconditionally.
// Container Apps resolves every declared secret at revision start, so a reference
// to a vault entry that does not exist fails the whole revision — including when
// Automate is deliberately unconfigured. An empty value is the way to say "off"
// without making the template branch on it.
resource automatePasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'automate-password'
  properties: { value: empty(automatePassword) ? 'unset' : automatePassword }
}

resource automateClientIdSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'automate-client-id'
  properties: { value: empty(automateClientId) ? 'unset' : automateClientId }
}

resource authTokenSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'mcp-auth-token'
  properties: { value: mcpAuthToken }
}

resource vaultAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, identity.id, keyVaultSecretsUserRoleId)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
  }
}

resource registryAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, acrPullRoleId)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: '${name}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }
}

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        // TLS terminates at the ingress; plain HTTP is redirected rather than served.
        allowInsecure: false
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: [
        {
          name: 'psa-public-key'
          keyVaultUrl: psaPublicKeySecret.properties.secretUri
          identity: identity.id
        }
        {
          name: 'psa-private-key'
          keyVaultUrl: psaPrivateKeySecret.properties.secretUri
          identity: identity.id
        }
        {
          name: 'psa-client-id'
          keyVaultUrl: psaClientIdSecret.properties.secretUri
          identity: identity.id
        }
        {
          name: 'automate-password'
          keyVaultUrl: automatePasswordSecret.properties.secretUri
          identity: identity.id
        }
        {
          name: 'automate-client-id'
          keyVaultUrl: automateClientIdSecret.properties.secretUri
          identity: identity.id
        }
        {
          name: 'mcp-auth-token'
          keyVaultUrl: authTokenSecret.properties.secretUri
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'server'
          image: containerImage
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: concat(
            [
              { name: 'PORT', value: '8080' }
              { name: 'CW_PSA_SITE', value: psaSite }
              { name: 'CW_PSA_COMPANY_ID', value: psaCompanyId }
              { name: 'CW_PSA_PUBLIC_KEY', secretRef: 'psa-public-key' }
              { name: 'CW_PSA_PRIVATE_KEY', secretRef: 'psa-private-key' }
              { name: 'CW_PSA_CLIENT_ID', secretRef: 'psa-client-id' }
              { name: 'MCP_AUTH_TOKEN', secretRef: 'mcp-auth-token' }
            ],
            // Both or neither: the server rejects a half-configured Entra setup
            // rather than quietly falling back to shared-token-only auth.
            empty(entraTenantId) || empty(entraClientId)
              ? []
              : [
                  { name: 'AZURE_TENANT_ID', value: entraTenantId }
                  { name: 'AZURE_CLIENT_ID', value: entraClientId }
                ],
            // Automate registers its tools only when configured, so leaving these
            // unset is how you deploy PSA-only rather than a thing to work around.
            empty(automateUrl)
              ? []
              : [
                  { name: 'CW_AUTOMATE_URL', value: automateUrl }
                  { name: 'CW_AUTOMATE_USERNAME', value: automateUsername }
                  { name: 'CW_AUTOMATE_PASSWORD', secretRef: 'automate-password' }
                  { name: 'CW_AUTOMATE_CLIENT_ID', secretRef: 'automate-client-id' }
                ]
          )
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/healthz', port: 8080 }
              initialDelaySeconds: 5
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/healthz', port: 8080 }
              initialDelaySeconds: 2
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http'
            http: { metadata: { concurrentRequests: '20' } }
          }
        ]
      }
    }
  }
  // The identity must be able to read the vault before the first revision starts,
  // or that revision fails to activate with an unhelpful secret-resolution error.
  dependsOn: [vaultAccess, registryAccess]
}

@description('The MCP endpoint to configure in your client.')
output mcpEndpoint string = 'https://${app.properties.configuration.ingress.fqdn}/mcp'

@description('Liveness probe URL, useful for confirming a rollout.')
output healthEndpoint string = 'https://${app.properties.configuration.ingress.fqdn}/healthz'

@description('Registry to push images to.')
output containerRegistryLoginServer string = registry.properties.loginServer

@description('Registry name, for `az acr build`.')
output containerRegistryName string = registry.name

@description('Key Vault holding the ConnectWise credentials, for rotation.')
output keyVaultName string = vault.name

@description('Container app name, for `az containerapp update`.')
output containerAppName string = app.name
