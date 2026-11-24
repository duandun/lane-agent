export const EVENTS = {
  welcome: 'welcome',
  phoneJoin: 'phone join',
  chatMessage: 'chat message',
  agentMessages: 'agent messages',
  agentSync: 'agent sync',
}

export const PHONE_ROLES = ['user', 'assistant', 'system', 'change']

export const LIMITS = {
  syncMessages: 100,
  phoneText: 4000,
  broadcastText: 500,
}

export const PHONE_CODE_RE = /^\d{6}$/
