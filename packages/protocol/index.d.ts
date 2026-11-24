export type PhoneRole = 'user' | 'assistant' | 'system' | 'change';

export type PhoneMessage = { role: PhoneRole; text: string };

export declare const EVENTS: {
  welcome: 'welcome';
  phoneJoin: 'phone join';
  chatMessage: 'chat message';
  agentMessages: 'agent messages';
  agentSync: 'agent sync';
};

export declare const PHONE_ROLES: readonly PhoneRole[];

export declare const LIMITS: {
  syncMessages: number;
  phoneText: number;
  broadcastText: number;
};

export declare const PHONE_CODE_RE: RegExp;
