import { IAdminForth, IWebSocketBroker, IWebSocketClient } from "../types/Back.js";

export default class SocketBroker implements IWebSocketBroker {
  clients: IWebSocketClient[] = [];
  topics: { [key: string]: IWebSocketClient[] } = {};
  adminforth: IAdminForth;
  deadCheckerRunning = false;

  constructor(adminforth: IAdminForth) {
    this.adminforth = adminforth;
  }

  async startChecker() {
    if (this.deadCheckerRunning) {
      return;
    }
    this.deadCheckerRunning = true;
    
    while (true) {
      await this.checkDeadClients();
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }

  async checkDeadClients() {
    const now = Date.now();
    const deadClients = [];
    for (const client of this.clients) {
      if (now - client.lastPing > 30_000) {
        deadClients.push(client);
      }
    }
    deadClients.forEach(client => {
      client.close();
      delete this.clients[client.id];
    });
  }

  deleteClientFromTopic(client: IWebSocketClient, topic: string) {
    if (!this.topics[topic]) {
      return;
    }
    this.topics[topic] = this.topics[topic].filter(c => c !== client);
  }

  cleanupTopicIfEmpty(topic: string) {
    if (!this.topics[topic]) {
      return;
    }
    if (this.topics[topic].length === 0) {
      delete this.topics[topic];
    }
  }
  
  registerWsClient(client: IWebSocketClient): void {
    this.startChecker();

    if (!this.clients[client.id]) {
      this.clients[client.id] = client;
    }
    client.onMessage(async (message) => {
      process.env.HEAVY_DEBUG && console.log('🐛 🪨🪨 Received message', message);
      if (message.toString() === 'ping') {
        client.send('pong');
        client.lastPing = Date.now();
      } else {
        const data = JSON.parse(message);
        if (data.type === 'subscribe') {
          if (this.adminforth.config.auth.websocketTopicAuth) {
            let authResult = false;
            try {
              authResult = await this.adminforth.config.auth.websocketTopicAuth(data.topic, client.adminUser);
            } catch (e) {
              console.error('Error in websocketTopicAuth, assuming connection not allowed', e);
            }
            if (!authResult) {
              client.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
              return;
            }
          }
          if (!data.topic) {
            client.send(JSON.stringify({ type: 'error', message: 'No topic provided' }));
          }
          if (!this.topics[data.topic]) {
            this.topics[data.topic] = [];
          }
          this.topics[data.topic].push(client);
          client.topics.add(data.topic);
          if (this.adminforth.config.auth.websocketSubscribed) {
            this.adminforth.config.auth.websocketSubscribed(data.topic, client.adminUser);
          }
        } else if (data.type === 'unsubscribe') {
          if (!data.topic) {
            client.send(JSON.stringify({ type: 'error', message: 'No topic provided' }));
          }
         
          this.deleteClientFromTopic(client, data.topic);
          this.cleanupTopicIfEmpty(data.topic);

          client.topics.delete(data.topic);
        }
      }
    });
    
    client.onClose(() => {
      for (const topic of client.topics) {
        this.deleteClientFromTopic(client, topic);
        this.cleanupTopicIfEmpty(topic);
      }
      delete this.clients[client.id];
    });

    // send ready message
    client.send(JSON.stringify({ type: 'ready' }));

  }

  publish(topic: string, data: any) {
    if (!this.topics[topic]) {
      process.env.HEAVY_DEBUG && console.log('No clients subscribed to topic', topic);
      return;
    }
    for (const client of this.topics[topic]) {
      process.env.HEAVY_DEBUG && console.log('Sending data to soket', topic, data);

      client.send(JSON.stringify({ type: 'message', topic, data }));
    }
  }
 
}