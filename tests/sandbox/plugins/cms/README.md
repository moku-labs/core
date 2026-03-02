# CMS

Content management with CRUD operations, media uploads, and versioning.

**Tier:** Very Complex

## Config

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `defaultLocale` | `string` | `"en"` | Default locale for new content |
| `maxUploadSize` | `number` | `10485760` | Maximum file upload size in bytes (10 MB) |

## API

### Content (`app.cms.content`)

#### `create(input: CreateContentInput): ContentItem`

Create a new content item.

#### `update(id: string, input: UpdateContentInput): ContentItem`

Update an existing content item.

#### `delete(id: string): boolean`

Delete a content item by ID.

#### `getById(id: string): ContentItem | undefined`

Retrieve a content item by ID.

#### `query(query?: ContentQuery): ContentItem[]`

Query content items by status and/or locale.

### Media (`app.cms.media`)

#### `upload(input: UploadInput): MediaAsset`

Upload a media file.

#### `getAsset(id: string): MediaAsset | undefined`

Retrieve a media asset by ID.

#### `list(): MediaAsset[]`

List all media assets.

#### `delete(id: string): boolean`

Delete a media asset by ID.

### Versioning (`app.cms.versioning`)

#### `commit(contentId: string, message: string): Version`

Create a versioned snapshot of a content item.

#### `revert(contentId: string, versionId: string): boolean`

Revert a content item to a previous version.

#### `diff(contentId: string, versionId: string): Diff[]`

Compare a content item's current state with a version.

#### `history(contentId: string): Version[]`

Get the version history for a content item.

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `cms:publish` | `{ contentId: string; path: string }` | Content published |
| `cms:draft` | `{ contentId: string }` | Draft saved |
| `cms:upload` | `{ assetId: string; mimeType: string }` | Media uploaded |

## Dependencies

- `router` — route registration for published content
- `analytics` — tracking content and media events

## Usage

```typescript
const app = createApp({
  plugins: [routerPlugin, analyticsPlugin, cmsPlugin],
  cms: { defaultLocale: "en", maxUploadSize: 10 * 1024 * 1024 }
});

// Content management
const item = app.cms.content.create({ title: "Hello", body: "World" });
app.cms.content.update(item.id, { status: "published" });
app.cms.content.query({ status: "published" });

// Media uploads
const asset = app.cms.media.upload({ filename: "photo.jpg", mimeType: "image/jpeg", size: 1024 });
app.cms.media.list();

// Versioning
const version = app.cms.versioning.commit(item.id, "Initial draft");
app.cms.versioning.diff(item.id, version.id);
app.cms.versioning.revert(item.id, version.id);
app.cms.versioning.history(item.id);
```
