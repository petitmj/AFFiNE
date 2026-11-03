import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-scalars';

@ObjectType()
export class NotionImportWarningType {
  @Field() code!: string;
  @Field() message!: string;
  @Field(() => String, { nullable: true }) notionId?: string;
}

@ObjectType()
export class NotionImportProgressType {
  @Field(() => Int) pendingTasks!: number;
  @Field(() => Int) doneTasks!: number;
  @Field(() => Int) failedTasks!: number;
  @Field(() => Int) warningCount!: number;
  /** The newest warnings. `warningCount` is the exact total. */
  @Field(() => [NotionImportWarningType]) warnings!: NotionImportWarningType[];
}

@ObjectType()
export class NotionImportType {
  @Field() id!: string;
  @Field() workspaceId!: string;
  @Field() status!: string;
  @Field(() => String, { nullable: true }) notionWorkspaceName?: string;
  @Field() apiVersion!: string;
  @Field(() => String, { nullable: true }) lastError?: string;
  @Field(() => Date) createdAt!: Date;
  @Field(() => Date) updatedAt!: Date;
  @Field(() => Date, { nullable: true }) finishedAt?: Date;
  @Field(() => Date) expiresAt!: Date;
  @Field(() => NotionImportProgressType) progress!: NotionImportProgressType;
}

@ObjectType()
export class NotionImportItemType {
  @Field() kind!: string;
  @Field() notionId!: string;
  @Field(() => String, { nullable: true }) parentId?: string;
  @Field(() => Int) position!: number;
  /** The Notion object exactly as Notion returned it. */
  @Field(() => GraphQLJSONObject) payload!: object;
}

@ObjectType()
export class NotionImportItemPageType {
  @Field(() => [NotionImportItemType]) items!: NotionImportItemType[];
  /** Pass as `after` to read the next page; null at the end. */
  @Field(() => String, { nullable: true }) endCursor?: string;
}

@ObjectType()
export class NotionImportFileType {
  @Field() ownerId!: string;
  @Field() slot!: string;
  @Field() status!: string;
  /** Workspace blob key holding the bytes, when stored. */
  @Field(() => String, { nullable: true }) blobKey?: string;
  @Field(() => Int, { nullable: true }) size?: number;
  @Field(() => String, { nullable: true }) mime?: string;
  @Field(() => String, { nullable: true }) lastError?: string;
}

@InputType()
export class CreateNotionImportInput {
  @Field() workspaceId!: string;
  /** Notion internal integration token. Stored encrypted, deleted when the run ends. */
  @Field() token!: string;
  /** Page or database ids to start from. Empty imports everything the integration can see. */
  @Field(() => [String], { nullable: true }) roots?: string[];
  /** Also read comments on every block, not just on pages. One request per block. */
  @Field(() => Boolean, { nullable: true }) includeBlockComments?: boolean;
}

@InputType()
export class NotionImportLedgerEntryInput {
  @Field() notionId!: string;
  @Field() subject!: string;
  /** mapped, degraded, preserved_only or unrecoverable. */
  @Field() outcome!: string;
  @Field(() => [String]) codes!: string[];
  @Field(() => String, { nullable: true }) affineDocId?: string;
  @Field(() => String, { nullable: true }) contentHash?: string;
}

@ObjectType()
export class NotionImportLedgerSummaryType {
  @Field(() => Int) mapped!: number;
  @Field(() => Int) degraded!: number;
  @Field(() => Int) preservedOnly!: number;
  @Field(() => Int) unrecoverable!: number;
}

@ObjectType()
export class NotionPreservedRecordType {
  @Field() kind!: string;
  @Field() notionId!: string;
  @Field(() => GraphQLJSONObject) payload!: object;
}

@ObjectType()
export class NotionPreservedRecordPageType {
  @Field(() => [NotionPreservedRecordType]) records!: NotionPreservedRecordType[];
  @Field(() => String, { nullable: true }) endCursor?: string;
}
