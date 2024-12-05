export function fetchWorker(method: "get", key: "deviceId" | "events" | "isAuthorized" | "isSubscribed" | "privateKey"): Promise<any>;
export function fetchWorker(method: "set", key: "deviceId" | "privateKey", value: any): Promise<any>;
export function fetchWorker(method: "get" | "set", key: "deviceId" | "events" | "isAuthorized" | "isSubscribed" | "privateKey", value?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!navigator.serviceWorker.controller) {
        return reject(new Error('Service Worker is not active'));
      }
  
      const messageChannel = new MessageChannel();
  
      messageChannel.port1.onmessage = (event) => {
        if (event.data.status === 'success') {
          resolve(event.data.data);
        } else {
          reject(new Error(event.data.error));
        }
      };
  
      navigator.serviceWorker.controller.postMessage({
        method, key, value
      }, [
        messageChannel.port2,
      ]);
    });
  }