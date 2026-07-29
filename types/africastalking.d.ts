declare module "africastalking" {
  type SmsSendOptions = {
    to: string | string[];
    message: string;
    enqueue?: boolean;
    senderId?: string;
  };

  type SmsService = {
    send(options: SmsSendOptions): Promise<unknown>;
  };

  type AfricaTalkingClient = {
    SMS: SmsService;
  };

  export default function AfricasTalking(options: {
    username: string;
    apiKey: string;
  }): AfricaTalkingClient;
}
