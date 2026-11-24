export type PhoneRole = 'user' | 'assistant' | 'system' | 'change';

export type PhoneMessage = { role: PhoneRole; text: string };

export declare const EVENTS: {
  welcome: 'welcome';
  phoneJoin: 'phone join';
  chatMessage: 'chat message';
  agentMessages: 'agent messages';
  agentSync: 'agent sync';
  agentForm: 'agent form';
  formAnswer: 'form answer';
};

export type PhoneFormValue =
  string | number | 'Infinity' | '-Infinity' | 'NaN' | boolean | string[];

export type PhoneFormWhen = {
  key: string;
  op: 'eq' | 'neq';
  value: string | number | 'Infinity' | '-Infinity' | 'NaN' | boolean;
};

export type PhoneFormOption = { value: string; label: string; description?: string };

type PhoneFormFieldBase = {
  key: string;
  title?: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  when?: PhoneFormWhen[];
};

// 与 @opencode/client 的 FormField 结构保持一致，web 端可以直接把 FormInfo 发过来。
export type PhoneFormField =
  | (PhoneFormFieldBase & {
      type: 'string';
      format?: 'email' | 'uri' | 'date' | 'date-time';
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      placeholder?: string;
      default?: string;
      options?: PhoneFormOption[];
      custom?: boolean;
    })
  | (PhoneFormFieldBase & {
      type: 'number' | 'integer';
      minimum?: number | 'Infinity' | '-Infinity' | 'NaN';
      maximum?: number | 'Infinity' | '-Infinity' | 'NaN';
      default?: number | 'Infinity' | '-Infinity' | 'NaN';
    })
  | (PhoneFormFieldBase & { type: 'boolean'; default?: boolean })
  | (PhoneFormFieldBase & {
      type: 'multiselect';
      options: PhoneFormOption[];
      minItems?: number;
      maxItems?: number;
      custom?: boolean;
      default?: string[];
    })
  | { key: string; type: 'external'; url: string; title?: string; description?: string };

export type PhoneForm = {
  id: string;
  sessionID: string;
  title: string;
  fields: PhoneFormField[];
};

export type PhoneFormAnswer = {
  formID: string;
  answer?: Record<string, PhoneFormValue>;
  cancel?: boolean;
};

export declare const PHONE_ROLES: readonly PhoneRole[];

export declare const LIMITS: {
  syncMessages: number;
  phoneText: number;
  broadcastText: number;
};

export declare const PHONE_CODE_RE: RegExp;
