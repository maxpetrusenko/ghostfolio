import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AiChatDto {
  @IsString()
  @IsNotEmpty()
  public query: string;

  @IsOptional()
  @IsString()
  public sessionId?: string;

  @IsOptional()
  @IsString()
  public conversationId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public symbols?: string[];

  @IsOptional()
  @IsString()
  public model?: string;

  @IsOptional()
  @IsString()
  public nextResponsePreference?: string;
}
