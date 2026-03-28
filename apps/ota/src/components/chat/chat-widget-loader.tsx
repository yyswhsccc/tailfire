"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("@/components/chat/chat-widget"), {
  ssr: false,
});

export function ChatWidgetLoader() {
  return <ChatWidget />;
}
