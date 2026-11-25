export type RelationshipIntentKey = "conversation"|"casual"|"friendship"|"dating"|"marriage";
export type PreferenceGroupKey = "meeting_styles"|"relationship_values"|"affection_styles"|"life_priorities";

export type ProfilePreferences = {
  relationship_intents:RelationshipIntentKey[];
  meeting_styles:string[];
  relationship_values:string[];
  affection_styles:string[];
  life_priorities:string[];
  custom:Record<PreferenceGroupKey,string[]>;
};

export type RelationshipIntent = {
  readonly key:RelationshipIntentKey;
  readonly label:string;
  readonly shortLabel:string;
  readonly description:string;
};

export type ProfilePreferenceGroup = {
  readonly key:PreferenceGroupKey;
  readonly label:string;
  readonly options:readonly {readonly key:string;readonly label:string}[];
};

export const MAX_PROFILE_CUSTOM_LENGTH:40;
export const MAX_PROFILE_GROUP_SELECTIONS:5;
export const relationshipIntents:readonly RelationshipIntent[];
export const profilePreferenceGroups:readonly ProfilePreferenceGroup[];
export const profilePreferenceKeys:Readonly<Record<PreferenceGroupKey,readonly string[]>>;
export function emptyProfilePreferences():ProfilePreferences;
export function normalizeProfilePreferences(value:unknown):ProfilePreferences;
