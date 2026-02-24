import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AiChatConversationUpdateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  public title: string;
}
