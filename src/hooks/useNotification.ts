import { createContext, useContext } from "react";

export type NotificationType = "success" | "error" | "info";

export interface NotificationAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  persistent?: boolean;
  tag?: string;
  duration?: number;
  avatarUrl?: string;
  action?: NotificationAction;
}

interface NotificationContextType {
  showNotification: (type: NotificationType, title: string, message: string, persistent?: boolean, tag?: string, duration?: number, avatarUrl?: string, action?: NotificationAction) => void;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotification must be used within NotificationProvider");
  return context;
};
