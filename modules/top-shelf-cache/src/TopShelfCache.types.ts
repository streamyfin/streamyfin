export type TopShelfCacheModuleEvents = Record<string, never>;

export interface TopShelfCacheItem {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  route: string;
  playRoute?: string;
}

export interface TopShelfCacheSection {
  title: string;
  items: TopShelfCacheItem[];
}

export interface TopShelfCachePayload {
  version: 1;
  updatedAt: string;
  sections: TopShelfCacheSection[];
}
