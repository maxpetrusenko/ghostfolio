import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AiChatConversationCreateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public title?: string;
}
