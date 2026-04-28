"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageSquare,
  Search,
  Paperclip,
  Send,
  Image as ImageIcon,
  Video,
  X,
  ChevronLeft,
  MoreVertical,
  Download,
  UserPlus,
  Users,
} from "lucide-react";

type Message = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  timestamp: Date;
  attachments?: {
    type: "image" | "video" | "file";
    url: string;
    name: string;
  }[];
  isRead: boolean;
};

type Contact = {
  id: string;
  name: string;
  avatar: string;
  role: string;
  lastSeen?: Date;
  isOnline?: boolean;
};

type Chat = {
  id: string;
  participants: Contact[];
  lastMessage?: Message;
  unreadCount: number;
  isGroup?: boolean;
  groupName?: string;
};

// Mock data
const mockContacts: Contact[] = [
  {
    id: "1",
    name: "Marco Bianchi",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=MarcoBianchi",
    role: "Allenatore",
    isOnline: true,
  },
  {
    id: "2",
    name: "Laura Rossi",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=LauraRossi",
    role: "Segreteria",
    lastSeen: new Date(Date.now() - 15 * 60 * 1000),
  },
  {
    id: "3",
    name: "Giuseppe Verdi",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=GiuseppeVerdi",
    role: "Direttore Sportivo",
    isOnline: true,
  },
  {
    id: "4",
    name: "Anna Neri",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=AnnaNeri",
    role: "Genitore",
    lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "5",
    name: "Mario Rossi",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=MarioRossi",
    role: "Atleta",
    lastSeen: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: "6",
    name: "Sofia Bianchi",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=SofiaBianchi",
    role: "Atleta",
    isOnline: true,
  },
  {
    id: "7",
    name: "Luca Ferrari",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=LucaFerrari",
    role: "Preparatore Atletico",
    lastSeen: new Date(Date.now() - 5 * 60 * 1000),
  },
  {
    id: "8",
    name: "Giulia Romano",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=GiuliaRomano",
    role: "Fisioterapista",
    isOnline: true,
  },
];

const mockChats: Chat[] = [
  {
    id: "chat1",
    participants: [mockContacts[0]],
    lastMessage: {
      id: "msg1",
      senderId: mockContacts[0].id,
      senderName: mockContacts[0].name,
      senderAvatar: mockContacts[0].avatar,
      content:
        "Buongiorno, volevo informarti che l'allenamento di oggi è confermato",
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      isRead: false,
    },
    unreadCount: 1,
  },
  {
    id: "chat2",
    participants: [mockContacts[1]],
    lastMessage: {
      id: "msg2",
      senderId: "currentUser",
      senderName: "Tu",
      senderAvatar: "",
      content: "Grazie per l'informazione, ci vediamo domani",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      isRead: true,
    },
    unreadCount: 0,
  },
  {
    id: "chat3",
    participants: [mockContacts[2]],
    lastMessage: {
      id: "msg3",
      senderId: mockContacts[2].id,
      senderName: mockContacts[2].name,
      senderAvatar: mockContacts[2].avatar,
      content:
        "Ti ho inviato il calendario degli allenamenti per il prossimo mese",
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      attachments: [
        {
          type: "file",
          url: "#",
          name: "calendario_allenamenti.pdf",
        },
      ],
      isRead: false,
    },
    unreadCount: 2,
  },
  {
    id: "chat4",
    participants: [mockContacts[3], mockContacts[4], mockContacts[5]],
    isGroup: true,
    groupName: "Genitori Categoria U14",
    lastMessage: {
      id: "msg4",
      senderId: mockContacts[3].id,
      senderName: mockContacts[3].name,
      senderAvatar: mockContacts[3].avatar,
      content: "Qualcuno sa a che ora è la partita di domenica?",
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      isRead: true,
    },
    unreadCount: 0,
  },
  {
    id: "chat5",
    participants: [mockContacts[6], mockContacts[7]],
    isGroup: true,
    groupName: "Staff Tecnico",
    lastMessage: {
      id: "msg5",
      senderId: mockContacts[6].id,
      senderName: mockContacts[6].name,
      senderAvatar: mockContacts[6].avatar,
      content:
        "Dobbiamo rivedere il programma di allenamento per la prossima settimana",
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
      isRead: false,
    },
    unreadCount: 1,
  },
];

const mockMessages: Record<string, Message[]> = {
  chat1: [
    {
      id: "msg1-1",
      senderId: mockContacts[0].id,
      senderName: mockContacts[0].name,
      senderAvatar: mockContacts[0].avatar,
      content: "Ciao, come stai?",
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      isRead: true,
    },
    {
      id: "msg1-2",
      senderId: "currentUser",
      senderName: "Tu",
      senderAvatar: "",
      content: "Tutto bene, grazie! E tu?",
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000),
      isRead: true,
    },
    {
      id: "msg1-3",
      senderId: mockContacts[0].id,
      senderName: mockContacts[0].name,
      senderAvatar: mockContacts[0].avatar,
      content:
        "Bene, grazie! Volevo informarti che abbiamo organizzato un torneo per il prossimo mese",
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      isRead: true,
    },
    {
      id: "msg1-4",
      senderId: "currentUser",
      senderName: "Tu",
      senderAvatar: "",
      content: "Fantastico! Quando si terrà esattamente?",
      timestamp: new Date(
        Date.now() - 1 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000,
      ),
      isRead: true,
    },
    {
      id: "msg1-5",
      senderId: mockContacts[0].id,
      senderName: mockContacts[0].name,
      senderAvatar: mockContacts[0].avatar,
      content: "Il 15 del prossimo mese. Ti invierò tutti i dettagli via email",
      timestamp: new Date(
        Date.now() - 1 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000,
      ),
      isRead: true,
    },
    {
      id: "msg1-6",
      senderId: mockContacts[0].id,
      senderName: mockContacts[0].name,
      senderAvatar: mockContacts[0].avatar,
      content:
        "Buongiorno, volevo informarti che l'allenamento di oggi è confermato",
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      isRead: false,
    },
  ],
  chat2: [
    {
      id: "msg2-1",
      senderId: mockContacts[1].id,
      senderName: mockContacts[1].name,
      senderAvatar: mockContacts[1].avatar,
      content: "Buongiorno, le ricordo che domani c'è la riunione dei genitori",
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      isRead: true,
    },
    {
      id: "msg2-2",
      senderId: "currentUser",
      senderName: "Tu",
      senderAvatar: "",
      content: "Grazie per il promemoria. A che ora inizia?",
      timestamp: new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000,
      ),
      isRead: true,
    },
    {
      id: "msg2-3",
      senderId: mockContacts[1].id,
      senderName: mockContacts[1].name,
      senderAvatar: mockContacts[1].avatar,
      content: "La riunione inizierà alle 18:30 nella sala principale",
      timestamp: new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000,
      ),
      isRead: true,
    },
    {
      id: "msg2-4",
      senderId: "currentUser",
      senderName: "Tu",
      senderAvatar: "",
      content: "Perfetto, ci sarò. Grazie per l'informazione",
      timestamp: new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000,
      ),
      isRead: true,
    },
    {
      id: "msg2-5",
      senderId: mockContacts[1].id,
      senderName: mockContacts[1].name,
      senderAvatar: mockContacts[1].avatar,
      content: "Le invio anche l'ordine del giorno della riunione",
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      attachments: [
        {
          type: "file",
          url: "#",
          name: "ordine_del_giorno.pdf",
        },
      ],
      isRead: true,
    },
    {
      id: "msg2-6",
      senderId: "currentUser",
      senderName: "Tu",
      senderAvatar: "",
      content: "Grazie per l'informazione, ci vediamo domani",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      isRead: true,
    },
  ],
  chat3: [
    {
      id: "msg3-1",
      senderId: mockContacts[2].id,
      senderName: mockContacts[2].name,
      senderAvatar: mockContacts[2].avatar,
      content:
        "Ciao, ho bisogno di parlarti riguardo al nuovo programma di allenamento",
      timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      isRead: true,
    },
    {
      id: "msg3-2",
      senderId: "currentUser",
      senderName: "Tu",
      senderAvatar: "",
      content: "Certamente, quando sei disponibile per un incontro?",
      timestamp: new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000,
      ),
      isRead: true,
    },
    {
      id: "msg3-3",
      senderId: mockContacts[2].id,
      senderName: mockContacts[2].name,
      senderAvatar: mockContacts[2].avatar,
      content: "Potremmo vederci domani alle 16:00 nel mio ufficio?",
      timestamp: new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000,
      ),
      isRead: true,
    },
    {
      id: "msg3-4",
      senderId: "currentUser",
      senderName: "Tu",
      senderAvatar: "",
      content: "Perfetto, ci sarò",
      timestamp: new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000 + 50 * 60 * 1000,
      ),
      isRead: true,
    },
    {
      id: "msg3-5",
      senderId: mockContacts[2].id,
      senderName: mockContacts[2].name,
      senderAvatar: mockContacts[2].avatar,
      content: "Ecco alcune foto dell'ultimo torneo",
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      attachments: [
        {
          type: "image",
          url: "https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&q=80",
          name: "torneo_1.jpg",
        },
        {
          type: "image",
          url: "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80",
          name: "torneo_2.jpg",
        },
      ],
      isRead: true,
    },
    {
      id: "msg3-6",
      senderId: mockContacts[2].id,
      senderName: mockContacts[2].name,
      senderAvatar: mockContacts[2].avatar,
      content:
        "Ti ho inviato il calendario degli allenamenti per il prossimo mese",
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      attachments: [
        {
          type: "file",
          url: "#",
          name: "calendario_allenamenti.pdf",
        },
      ],
      isRead: false,
    },
    {
      id: "msg3-7",
      senderId: mockContacts[2].id,
      senderName: mockContacts[2].name,
      senderAvatar: mockContacts[2].avatar,
      content:
        "Ricordati di confermare la tua presenza alla riunione di venerdì",
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
      isRead: false,
    },
  ],
};

export function ChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setIsOpen(true)}
        title="Chat"
      >
        <MessageSquare className="h-5 w-5" />
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
          3
        </span>
      </Button>

      <ChatDialog open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}

function ChatDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeView, setActiveView] = useState<
    "chats" | "contacts" | "chat" | "create-group"
  >("chats");
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [activeChatMessages, setActiveChatMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [groupName, setGroupName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Filter contacts based on search query
  const filteredContacts = mockContacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.role.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Filter chats based on search query
  const filteredChats = mockChats.filter(
    (chat) =>
      chat.participants.some((participant) =>
        participant.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ) ||
      (chat.lastMessage?.content
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ??
        false) ||
      (chat.isGroup &&
        chat.groupName?.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  // Handle opening a chat
  const handleOpenChat = (chat: Chat) => {
    setActiveChat(chat);
    setActiveChatMessages(mockMessages[chat.id] || []);
    setActiveView("chat");
  };

  // Handle starting a new chat with a contact
  const handleStartChat = (contact: Contact) => {
    // Check if chat already exists
    const existingChat = mockChats.find((chat) =>
      chat.participants.some((p) => p.id === contact.id),
    );

    if (existingChat) {
      handleOpenChat(existingChat);
    } else {
      // Create a new chat
      const newChat: Chat = {
        id: `new-chat-${Date.now()}`,
        participants: [contact],
        unreadCount: 0,
      };
      setActiveChat(newChat);
      setActiveChatMessages([]);
      setActiveView("chat");
    }
  };

  // Handle sending a message
  const handleSendMessage = () => {
    if (!activeChat || (!newMessage.trim() && selectedFiles.length === 0))
      return;

    const attachments = selectedFiles.map((file) => {
      const type = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file";

      return {
        type,
        url: URL.createObjectURL(file),
        name: file.name,
      };
    });

    const newMsg: Message = {
      id: `new-msg-${Date.now()}`,
      senderId: "currentUser",
      senderName: "Tu",
      senderAvatar: "",
      content: newMessage,
      timestamp: new Date(),
      attachments: attachments.length > 0 ? attachments : undefined,
      isRead: false,
    };

    setActiveChatMessages([...activeChatMessages, newMsg]);
    setNewMessage("");
    setSelectedFiles([]);

    // Simulate a reply after 1-3 seconds
    if (activeChat.participants.length > 0) {
      const participant = activeChat.participants[0];
      setTimeout(
        () => {
          const replyMsg: Message = {
            id: `reply-msg-${Date.now()}`,
            senderId: participant.id,
            senderName: participant.name,
            senderAvatar: participant.avatar,
            content: getRandomReply(),
            timestamp: new Date(),
            isRead: false,
          };
          setActiveChatMessages((prev) => [...prev, replyMsg]);
        },
        1000 + Math.random() * 2000,
      );
    }
  };

  // Random replies
  const getRandomReply = () => {
    const replies = [
      "Va bene, grazie per l'informazione!",
      "Perfetto, ci vediamo più tardi.",
      "Ottimo, grazie mille!",
      "Ho capito, a presto!",
      "Grazie per l'aggiornamento.",
      "Ricevuto, buona giornata!",
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  // Handle removing a selected file
  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Format timestamp
  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Ieri";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
    }
  };

  // Handle creating a new group chat
  const handleCreateGroup = () => {
    if (selectedContacts.length < 2 || !groupName.trim()) return;

    // Create a new group chat
    const newGroupChat: Chat = {
      id: `group-chat-${Date.now()}`,
      participants: selectedContacts,
      isGroup: true,
      groupName: groupName.trim(),
      unreadCount: 0,
    };

    // Add to mock chats (in a real app, this would be saved to a database)
    mockChats.push(newGroupChat);

    // Reset state and go back to chats view
    setSelectedContacts([]);
    setGroupName("");
    setActiveView("chats");
  };

  // Toggle contact selection for group creation
  const toggleContactSelection = (contact: Contact) => {
    if (selectedContacts.some((c) => c.id === contact.id)) {
      setSelectedContacts(selectedContacts.filter((c) => c.id !== contact.id));
    } else {
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  // Scroll to bottom of messages when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChatMessages]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 h-[80vh] overflow-hidden">
        <div className="flex h-full">
          {/* Left sidebar */}
          <div className="w-96 border-r border-gray-200 dark:border-gray-700 flex flex-col">
            {activeView === "chats" ||
            activeView === "contacts" ||
            activeView === "create-group" ? (
              <>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">
                      {activeView === "chats"
                        ? "Chat"
                        : activeView === "contacts"
                          ? "Contatti"
                          : "Nuovo Gruppo"}
                    </h2>
                    <div className="flex gap-2">
                      <Button
                        variant={activeView === "chats" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveView("chats")}
                      >
                        Chat
                      </Button>
                      <Button
                        variant={
                          activeView === "contacts" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setActiveView("contacts")}
                      >
                        Contatti
                      </Button>
                      <Button
                        variant={
                          activeView === "create-group" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setActiveView("create-group")}
                        title="Crea gruppo"
                      >
                        <Users size={16} />
                      </Button>
                    </div>
                  </div>
                  {activeView !== "create-group" && (
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={
                          activeView === "chats"
                            ? "Cerca nelle chat..."
                            : "Chi vuoi contattare?"
                        }
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <ScrollArea className="flex-1">
                  {activeView === "chats" ? (
                    <div className="p-2">
                      {filteredChats.length > 0 ? (
                        filteredChats.map((chat) => (
                          <div
                            key={chat.id}
                            className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                            onClick={() => handleOpenChat(chat)}
                          >
                            {chat.isGroup ? (
                              <div className="relative">
                                <Avatar>
                                  <AvatarFallback className="bg-blue-600 text-white">
                                    <Users size={18} />
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                            ) : (
                              <Avatar>
                                <AvatarImage
                                  src={chat.participants[0]?.avatar}
                                />
                                <AvatarFallback>
                                  {chat.participants[0]?.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center">
                                <p className="font-medium truncate">
                                  {chat.isGroup
                                    ? chat.groupName
                                    : chat.participants[0]?.name}
                                </p>
                                {chat.lastMessage && (
                                  <p className="text-xs text-muted-foreground">
                                    {formatTimestamp(
                                      chat.lastMessage.timestamp,
                                    )}
                                  </p>
                                )}
                              </div>
                              {chat.lastMessage && (
                                <p className="text-sm text-muted-foreground truncate">
                                  {chat.isGroup &&
                                    chat.lastMessage.senderId !==
                                      "currentUser" &&
                                    `${chat.lastMessage.senderName.split(" ")[0]}: `}
                                  {chat.lastMessage.senderId ===
                                    "currentUser" && "Tu: "}
                                  {chat.lastMessage.attachments ? (
                                    <span className="flex items-center gap-1">
                                      <Paperclip className="h-3 w-3" />
                                      File
                                    </span>
                                  ) : (
                                    chat.lastMessage.content
                                  )}
                                </p>
                              )}
                            </div>
                            {chat.unreadCount > 0 && (
                              <Badge className="bg-blue-600">
                                {chat.unreadCount}
                              </Badge>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground p-4">
                          Nessuna chat trovata
                        </p>
                      )}
                    </div>
                  ) : activeView === "contacts" ? (
                    <div className="p-2">
                      {filteredContacts.length > 0 ? (
                        filteredContacts.map((contact) => (
                          <div
                            key={contact.id}
                            className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                            onClick={() => handleStartChat(contact)}
                          >
                            <div className="relative">
                              <Avatar>
                                <AvatarImage src={contact.avatar} />
                                <AvatarFallback>
                                  {contact.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              {contact.isOnline && (
                                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-white dark:border-gray-900"></span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {contact.name}
                              </p>
                              <p className="text-sm text-muted-foreground truncate">
                                {contact.role}
                              </p>
                            </div>
                            {contact.lastSeen && !contact.isOnline && (
                              <p className="text-xs text-muted-foreground">
                                {formatTimestamp(contact.lastSeen)}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground p-4">
                          Nessun contatto trovato
                        </p>
                      )}
                    </div>
                  ) : activeView === "create-group" ? (
                    <div className="p-4">
                      <h3 className="font-medium mb-4">Crea un nuovo gruppo</h3>

                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1">
                          Nome del gruppo
                        </label>
                        <Input
                          placeholder="Inserisci il nome del gruppo"
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                        />
                      </div>

                      <div className="mb-2">
                        <label className="block text-sm font-medium mb-1">
                          Seleziona partecipanti ({selectedContacts.length}{" "}
                          selezionati)
                        </label>
                      </div>

                      {selectedContacts.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {selectedContacts.map((contact) => (
                            <Badge
                              key={contact.id}
                              variant="secondary"
                              className="flex items-center gap-1"
                            >
                              {contact.name.split(" ")[0]}
                              <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => toggleContactSelection(contact)}
                              />
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="max-h-60 overflow-y-auto border rounded-md">
                        {mockContacts.map((contact) => (
                          <div
                            key={contact.id}
                            className={`flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer ${selectedContacts.some((c) => c.id === contact.id) ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                            onClick={() => toggleContactSelection(contact)}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={contact.avatar} />
                              <AvatarFallback>
                                {contact.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">
                                {contact.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {contact.role}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setActiveView("chats")}
                        >
                          Annulla
                        </Button>
                        <Button
                          onClick={handleCreateGroup}
                          disabled={
                            selectedContacts.length < 2 || !groupName.trim()
                          }
                        >
                          Crea gruppo
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </ScrollArea>
              </>
            ) : (
              <>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setActiveView("chats")}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    {activeChat?.isGroup ? (
                      <Avatar>
                        <AvatarFallback className="bg-blue-600 text-white">
                          <Users size={18} />
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <Avatar>
                        <AvatarImage
                          src={activeChat?.participants[0]?.avatar}
                        />
                        <AvatarFallback>
                          {activeChat?.participants[0]?.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {activeChat?.isGroup
                          ? activeChat.groupName
                          : activeChat?.participants[0]?.name}
                      </p>
                      {activeChat?.isGroup ? (
                        <p className="text-xs text-muted-foreground">
                          {activeChat.participants.length} partecipanti
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {activeChat?.participants[0]?.isOnline
                            ? "Online"
                            : "Offline"}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4" ref={chatContainerRef}>
                  <div className="space-y-4">
                    {activeChatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.senderId === "currentUser" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] ${message.senderId === "currentUser" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800"} rounded-lg p-3`}
                        >
                          {message.content && <p>{message.content}</p>}
                          {message.attachments &&
                            message.attachments.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {message.attachments.map(
                                  (attachment, index) => (
                                    <div key={index}>
                                      {attachment.type === "image" ? (
                                        <div className="relative">
                                          <img
                                            src={attachment.url}
                                            alt={attachment.name}
                                            className="rounded-md max-h-60 w-auto object-cover cursor-pointer"
                                          />
                                        </div>
                                      ) : attachment.type === "video" ? (
                                        <div className="relative">
                                          <video
                                            src={attachment.url}
                                            controls
                                            className="rounded-md max-h-60 w-auto object-cover"
                                          />
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 p-2 bg-gray-200 dark:bg-gray-700 rounded-md">
                                          <Paperclip className="h-4 w-4" />
                                          <span className="text-sm truncate flex-1">
                                            {attachment.name}
                                          </span>
                                          <Button variant="ghost" size="icon">
                                            <Download className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  ),
                                )}
                              </div>
                            )}
                          <p
                            className={`text-xs mt-1 ${message.senderId === "currentUser" ? "text-blue-200" : "text-muted-foreground"}`}
                          >
                            {formatTimestamp(message.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                  {selectedFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {selectedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-full pl-2 pr-1 py-1"
                        >
                          <span className="text-xs truncate max-w-[100px]">
                            {file.name}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => handleRemoveFile(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      multiple
                      onChange={handleFileSelect}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/*";
                        input.onchange = (e) => handleFileSelect(e as any);
                        input.click();
                      }}
                    >
                      <ImageIcon className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "video/*";
                        input.onchange = (e) => handleFileSelect(e as any);
                        input.click();
                      }}
                    >
                      <Video className="h-5 w-5" />
                    </Button>
                    <Textarea
                      placeholder="Scrivi un messaggio..."
                      className="flex-1 min-h-10 max-h-32"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={
                        !newMessage.trim() && selectedFiles.length === 0
                      }
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right side - chat preview */}
          {activeView !== "chat" && (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto text-gray-300 dark:text-gray-700" />
                <h3 className="text-xl font-medium mt-4">
                  Seleziona una chat per iniziare
                </h3>
                <p className="text-muted-foreground mt-2 max-w-md">
                  Scegli una chat esistente o inizia una nuova conversazione con
                  un contatto
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
