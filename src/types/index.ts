import { z } from "zod";

// OAuth Configuration
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface TokenData {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type: string;
  scope: string;
}

// Google Drive Types
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  owners?: Array<{ displayName: string; emailAddress: string }>;
}

export interface DriveListOptions {
  pageSize?: number;
  pageToken?: string;
  query?: string;
  orderBy?: string;
  folderId?: string;
}

// Google Docs Types
export interface DocContent {
  documentId: string;
  title: string;
  body?: string;
  revisionId?: string;
}

export interface DocCreateOptions {
  title: string;
  content?: string;
  folderId?: string;
}

export interface DocUpdateOptions {
  documentId: string;
  operations: DocOperation[];
}

export type DocOperation =
  | { type: "insertText"; text: string; index: number }
  | { type: "deleteContent"; startIndex: number; endIndex: number }
  | { type: "replaceText"; text: string; startIndex: number; endIndex: number };

// Google Sheets Types
export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  sheets: SheetInfo[];
  spreadsheetUrl: string;
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export interface SheetRange {
  spreadsheetId: string;
  range: string;
  values: unknown[][];
}

export interface SheetCreateOptions {
  title: string;
  sheets?: string[];
  folderId?: string;
}

export interface SheetUpdateOptions {
  spreadsheetId: string;
  range: string;
  values: unknown[][];
  valueInputOption?: "RAW" | "USER_ENTERED";
}

// Google Tasks (Keep alternative) Types
export interface TaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
  parent?: string;
  position?: string;
}

export interface TaskCreateOptions {
  taskListId: string;
  title: string;
  notes?: string;
  due?: string;
}

export interface TaskUpdateOptions {
  taskListId: string;
  taskId: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  due?: string;
}

// Zod Schemas for validation
export const DriveListOptionsSchema = z.object({
  pageSize: z.number().min(1).max(1000).optional().default(50),
  pageToken: z.string().optional(),
  query: z.string().optional(),
  orderBy: z.string().optional(),
  folderId: z.string().optional(),
});

export const DocCreateOptionsSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  folderId: z.string().optional(),
});

export const DocReadOptionsSchema = z.object({
  documentId: z.string().min(1),
});

export const DocUpdateTextSchema = z.object({
  documentId: z.string().min(1),
  text: z.string(),
  index: z.number().min(1),
});

export const DocReplaceTextSchema = z.object({
  documentId: z.string().min(1),
  searchText: z.string().min(1),
  replaceText: z.string(),
  matchCase: z.boolean().optional().default(true),
});

export const SheetCreateOptionsSchema = z.object({
  title: z.string().min(1),
  sheets: z.array(z.string()).optional(),
  folderId: z.string().optional(),
});

export const SheetReadOptionsSchema = z.object({
  spreadsheetId: z.string().min(1),
  range: z.string().optional(),
});

export const SheetUpdateOptionsSchema = z.object({
  spreadsheetId: z.string().min(1),
  range: z.string().min(1),
  values: z.array(z.array(z.unknown())),
  valueInputOption: z.enum(["RAW", "USER_ENTERED"]).optional().default("USER_ENTERED"),
});

export const SheetAppendOptionsSchema = z.object({
  spreadsheetId: z.string().min(1),
  range: z.string().min(1),
  values: z.array(z.array(z.unknown())),
  valueInputOption: z.enum(["RAW", "USER_ENTERED"]).optional().default("USER_ENTERED"),
});

export const TaskListCreateSchema = z.object({
  title: z.string().min(1),
});

export const TaskCreateOptionsSchema = z.object({
  taskListId: z.string().min(1),
  title: z.string().min(1),
  notes: z.string().optional(),
  due: z.string().optional(),
});

export const TaskUpdateOptionsSchema = z.object({
  taskListId: z.string().min(1),
  taskId: z.string().min(1),
  title: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["needsAction", "completed"]).optional(),
  due: z.string().optional(),
});

export const DriveDownloadSchema = z.object({
  fileId: z.string().min(1),
});

export const DriveUploadSchema = z.object({
  name: z.string().min(1),
  content: z.string(),
  mimeType: z.string().optional(),
  folderId: z.string().optional(),
});

export const DriveDeleteSchema = z.object({
  fileId: z.string().min(1),
});

export const DriveCreateFolderSchema = z.object({
  name: z.string().min(1),
  parentFolderId: z.string().optional(),
});

export const DriveSearchSchema = z.object({
  query: z.string().min(1),
  pageSize: z.number().min(1).max(1000).optional().default(50),
  pageToken: z.string().optional(),
});

export const PhotosUploadSchema = z
  .object({
    content: z.string().min(1).optional(),
    filePath: z.string().min(1).optional(),
    filename: z.string().min(1).optional(),
    mimeType: z.string().min(1),
    albumId: z.string().optional(),
    description: z.string().optional(),
  })
  .refine((data) => Boolean(data.content) !== Boolean(data.filePath), {
    message: "Provide exactly one of content or filePath, not both or neither",
  })
  .refine((data) => Boolean(data.filePath) || Boolean(data.filename), {
    message: "filename is required when uploading via content",
  });

