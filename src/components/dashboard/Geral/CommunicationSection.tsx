import {
  Plus,
  ThumbsUp,
  Edit2,
  EyeOff,
  Image as ImageIcon,
  Tag,
  MessageCircle,
  Send,
  Smile,
  Maximize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/uploadImage";
import { Button } from "@/components/ui/button";
import { TinyDropdown } from "@/components/ui/TinyDropdown";
import { useNotification } from "@/hooks/useNotification";

const categories = ["Todos", "Empresa", "Social", "Eventos", "Avisos"];

export interface CommunicationPost {
  id: number | string;
  dbId: string | number;
  title: string;
  content: string;
  category: string;
  author: string;
  authorAvatar: string;
  date: string;
  image: string;
  likes: number;
  likedBy: string[];
  /** ID do usuário homenageado no comunicado (ex.: Isabela) */
  taggedUserId?: string | null;
  /** ID do usuário que criou o comunicado */
  postUserId?: string | null;
}

interface ComunicadoComment {
  id: string | number;
  content: string;
  author: string;
  authorAvatar: string;
  date: string;
  userId: string;
  likes: number;
  liked_by: string[];
  reactions: Record<string, string[]>;
  parent_id: string | number | null;
  replies: ComunicadoComment[];
}

interface DbComunicado {
  id: number;
  titulo: string;
  descricao: string | null;
  filtro: string | null;
  tag: string | null;
  image_url: string | null;
  image: string | null;
  created_at: string;
  likes: number | null;
  liked_by: string[] | null;
  user_id: string | null;
  tagged_user_id: string | null;
  usuarios: {
    name: string;
    avatar: string | null;
  } | null;
}

export interface UserProfile {
  id?: string;
  name: string;
  role: string;
  permissions?: string[];
  avatar?: string;
  is_leader?: boolean;
}

/** Renderiza o conteúdo de comunicados de alteração de preço como linhas estruturadas */
// Classifica o comunicado para respeitar as preferências de notificação do
// usuário (Configurações > Notificações > Comunicação Interna). Só oculta
// quando o toggle correspondente está explicitamente desligado.
function isCommVisibleForPrefs(
  post: { title?: string; content?: string },
  equipePrefs: Record<string, boolean> | undefined,
): boolean {
  if (!equipePrefs) return true;
  const title = (post.title || "").toUpperCase();
  const content = post.content || "";
  if (title.includes("ALTERACOES DE PRECO")) return equipePrefs.priceChange !== false;
  if (content.startsWith("Chegou material do fornecedor")) return equipePrefs.productArrival !== false;
  return equipePrefs.broadcast !== false; // comunicados gerais
}

function PriceChangeContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const productLines = lines.filter((l) => l.startsWith("\u2022"));
  const footerLine = lines.find((l) => l.startsWith("Total"));

  const parseProductLine = (line: string) => {
    // Para antes de qualquer horário residual: captura apenas R$ seguido de dígitos/vírgula/ponto
    const match = line.match(
      /^\u2022 \[(\w+)\] (.+) \u2014 de (R\$\s*[\d.,]+) para (R\$\s*[\d.,]+)/,
    );
    if (!match) return null;

    const fromStr = match[3].trim();
    const toStr = match[4].trim();

    // Converte "R$ 1.234,56" → 1234.56
    const parseBR = (s: string) =>
      parseFloat(
        s
          .replace(/R\$\s*/, "")
          .replace(/\./g, "")
          .replace(",", "."),
      );

    const fromNum = parseBR(fromStr);
    const toNum = parseBR(toStr);
    const pct = fromNum > 0 ? ((toNum - fromNum) / fromNum) * 100 : 0;

    return { code: match[1], name: match[2], from: fromStr, to: toStr, pct };
  };

  return (
    <div className="flex flex-col gap-1 mb-1">
      <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
        {productLines.map((line, i) => {
          const product = parseProductLine(line);
          if (!product)
            return (
              <p key={i} className="text-xs text-muted-foreground">
                {line}
              </p>
            );
          const isIncrease = product.pct >= 0;
          return (
            <div
              key={i}
              className="flex items-center gap-2 py-1 px-2 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-colors"
            >
              <span className="font-black text-muted-foreground shrink-0 text-[9px] bg-secondary border border-border px-1.5 py-0.5 rounded-md leading-none">
                {product.code}
              </span>
              <span
                className="flex-1 font-semibold text-foreground text-[11px] truncate"
                title={product.name}
              >
                {product.name}
              </span>
              <span className="shrink-0 text-muted-foreground/50 line-through text-[10px] font-medium">
                {product.from}
              </span>
              <span className="shrink-0 font-black text-foreground text-[11px]">
                {product.to}
              </span>
              <span
                className={cn(
                  "shrink-0 font-black text-[10px] px-1.5 py-0.5 rounded-md min-w-[40px] text-center",
                  isIncrease
                    ? "text-red-500 bg-red-500/10 dark:bg-red-500/15"
                    : "text-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15",
                )}
              >
                {isIncrease ? "+" : ""}
                {product.pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
      {footerLine && (
        <p className="text-[10px] text-muted-foreground/50 font-medium mt-0.5">
          {footerLine}
        </p>
      )}
    </div>
  );
}

/** Renderiza o comunicado de recebimento de material como itens estruturados, agrupados por nota fiscal */
function MaterialReceivedContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const footerLine = lines.find((l) => l.trim().startsWith("Total"));

  type Entry =
    | { type: "nf"; label: string }
    | { type: "item"; code: string; name: string; qty: string };

  const entries: Entry[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^NF\s+/i.test(line)) {
      entries.push({ type: "nf", label: line.replace(/:$/, "") });
    } else if (line.startsWith("•")) {
      const m = line.match(/^•\s*\[([^\]]+)\]\s*(.+?)\s*—\s*(.+?)\s*un$/);
      if (m) {
        entries.push({ type: "item", code: m[1], name: m[2], qty: m[3] });
      } else {
        entries.push({ type: "item", code: "", name: line.replace(/^•\s*/, ""), qty: "" });
      }
    }
  }

  return (
    <div className="flex flex-col gap-1 mb-1">
      <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
        {entries.map((e, i) =>
          e.type === "nf" ? (
            <div key={i} className="flex items-center gap-2 mt-1 first:mt-0">
              <span className="text-[9px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest shrink-0">
                {e.label}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          ) : (
            <div
              key={i}
              className="flex items-center gap-2 py-1 px-2 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-colors"
            >
              {e.code && (
                <span className="font-black text-muted-foreground shrink-0 text-[9px] bg-secondary border border-border px-1.5 py-0.5 rounded-md leading-none">
                  {e.code}
                </span>
              )}
              <span
                className="flex-1 font-semibold text-foreground text-[11px] truncate"
                title={e.name}
              >
                {e.name}
              </span>
              {e.qty && (
                <span className="shrink-0 font-black text-[10px] px-1.5 py-0.5 rounded-md text-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15">
                  {e.qty} un
                </span>
              )}
            </div>
          ),
        )}
      </div>
      {footerLine && (
        <p className="text-[10px] text-muted-foreground/50 font-medium mt-0.5">
          {footerLine}
        </p>
      )}
    </div>
  );
}

function CommentBubble({
  comment,
  currentUserId,
  openReactionPicker,
  setOpenReactionPicker,
  reactionPickerRef,
  onLike,
  onReaction,
  onReply,
  replyingToId,
  isReply = false,
  parentAuthor,
}: {
  comment: ComunicadoComment;
  currentUserId?: string;
  openReactionPicker: string | number | null;
  setOpenReactionPicker: (id: string | number | null) => void;
  reactionPickerRef: React.RefObject<HTMLDivElement | null>;
  onLike: (id: string | number, liked_by: string[], likes: number) => void;
  onReaction: (
    id: string | number,
    emoji: string,
    reactions: Record<string, string[]>,
  ) => void;
  onReply: (id: string | number, author: string) => void;
  replyingToId: string | number | null;
  isReply?: boolean;
  parentAuthor?: string;
}) {
  return (
    <div className={cn("flex gap-2 items-start", isReply && "ml-10")}>
      <img
        src={comment.authorAvatar}
        className={cn(
          "rounded-full object-cover shrink-0 ring-1 ring-border shadow-sm",
          isReply ? "w-7 h-7" : "w-8 h-8",
        )}
        alt={comment.author}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="relative w-fit max-w-[95%]">
          <div
            className={cn(
              "bg-slate-100 dark:bg-slate-800/80 rounded-2xl px-3 py-2 w-fit max-w-full",
              String(replyingToId) === String(comment.id) &&
                "ring-2 ring-blue-400 dark:ring-blue-600",
            )}
          >
            <span className="text-[11px] font-bold text-slate-900 dark:text-white block leading-none mb-1">
              {comment.author}
              {isReply && parentAuthor && (
                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 ml-1">
                  ▸ {parentAuthor}
                </span>
              )}
            </span>
            <span className="text-xs text-slate-800 dark:text-slate-200 leading-snug break-words">
              {comment.content}
            </span>
          </div>
          {(comment.likes > 0 || Object.keys(comment.reactions).length > 0) && (
            <div className="absolute -bottom-2 -right-2 bg-card border border-border shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-1 z-10">
              <div className="flex -space-x-1 pr-0.5">
                {comment.likes > 0 && (
                  <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center ring-2 ring-card z-20">
                    <ThumbsUp className="w-2.5 h-2.5 text-white fill-current" />
                  </div>
                )}
                {Object.keys(comment.reactions)
                  .slice(0, 2)
                  .map((emoji, idx) => (
                    <div
                      key={emoji}
                      className={cn(
                        "w-4 h-4 rounded-full bg-secondary flex items-center justify-center ring-2 ring-card text-[10px] leading-none",
                        idx === 0 ? "z-10" : "z-0",
                      )}
                    >
                      {emoji}
                    </div>
                  ))}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium pl-0.5 leading-none">
                {comment.likes +
                  Object.values(comment.reactions).reduce(
                    (acc, curr) => acc + curr.length,
                    0,
                  )}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 mt-1 ml-3">
          <span>{comment.date}</span>
          <div
            className="relative"
            ref={
              String(openReactionPicker) === String(comment.id) ? reactionPickerRef : undefined
            }
          >
            <button
              onClick={() =>
                setOpenReactionPicker(
                  String(openReactionPicker) === String(comment.id) ? null : comment.id,
                )
              }
              className={cn(
                "hover:underline transition-colors",
                comment.liked_by.includes(currentUserId || "")
                  ? "text-blue-600 dark:text-blue-500"
                  : "",
              )}
            >
              Curtir
            </button>
            {String(openReactionPicker) === String(comment.id) && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                <div className="bg-card border border-border shadow-[0_4px_12px_rgba(0,0,0,0.1)] rounded-full px-1.5 py-1 flex items-center gap-1">
                  {["👍", "❤️", "😂", "👏", "😢", "🚀"].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReaction(comment.id, emoji, comment.reactions);
                        setOpenReactionPicker(null);
                      }}
                      className={cn(
                        "w-8 h-8 flex items-center justify-center text-xl hover:scale-125 hover:-translate-y-1 transition-transform origin-bottom",
                        comment.reactions[emoji]?.includes(currentUserId || "")
                          ? "opacity-100"
                          : "opacity-90",
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {!isReply && (
            <button
              onClick={() => onReply(comment.id, comment.author)}
              className="hover:underline"
            >
              Responder
            </button>
          )}
        </div>
        {comment.replies.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-1.5">
            {comment.replies.map((reply) => (
              <CommentBubble
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                openReactionPicker={openReactionPicker}
                setOpenReactionPicker={setOpenReactionPicker}
                reactionPickerRef={reactionPickerRef}
                onLike={onLike}
                onReaction={onReaction}
                onReply={onReply}
                replyingToId={replyingToId}
                isReply
                parentAuthor={comment.author}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getUserCache(): Record<string, { id: string; name: string; avatar: string | null }> {
  return (window as unknown as { _carflaxUserCache?: Record<string, { id: string; name: string; avatar: string | null }> })._carflaxUserCache || {};
}

async function resolveTaggedUserId(post: CommunicationPost): Promise<string | null> {
  if (post.taggedUserId) return post.taggedUserId;
  try {
    const postTitle = (post.title || "").toUpperCase();
    const { data: users } = await supabase
      .from("usuarios")
      .select("id, name");
    if (users && users.length > 0) {
      for (const u of users) {
        if (!u.name) continue;
        const uName = u.name.toUpperCase().trim();
        if (uName.length > 3 && postTitle.includes(uName)) {
          supabase.from("comunicados").update({ tagged_user_id: u.id }).eq("id", post.dbId).then();
          post.taggedUserId = u.id;
          return u.id;
        }
      }
      for (const u of users) {
        if (!u.name) continue;
        const parts = u.name.toUpperCase().trim().split(/\s+/);
        if (parts.length >= 2) {
          const pair = `${parts[0]} ${parts[1]}`;
          if (postTitle.includes(pair)) {
            supabase.from("comunicados").update({ tagged_user_id: u.id }).eq("id", post.dbId).then();
            post.taggedUserId = u.id;
            return u.id;
          }
        }
      }
    }
  } catch (err) {
    console.error("Erro ao resolver homenageado:", err);
  }
  return null;
}


export function CommunicationCard({
  data,
  onEdit,
  onHide,
  userProfile,
  initialCommentCount = 0,
  onCommentCountChange,
  openRequest,
}: {
  data: CommunicationPost;
  onEdit: (d: CommunicationPost) => void;
  onHide: (id: string | number) => void;
  userProfile?: UserProfile;
  initialCommentCount?: number;
  onCommentCountChange?: (dbId: string | number, count: number) => void;
  openRequest?: { id: string; openComments: boolean; token: number } | null;
}) {
  const currentUserId = userProfile?.id;
  const canManage =
    userProfile?.is_leader ||
    userProfile?.role === "admin";
  const isLiked = currentUserId ? data.likedBy.includes(currentUserId) : false;
  // Fonte única de verdade: o tamanho do array liked_by (evita divergência com o campo numérico likes)
  const [likes, setLikes] = useState(data.likedBy?.length ?? data.likes ?? 0);
  const [interaction, setInteraction] = useState<"like" | null>(
    isLiked ? "like" : null,
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [likersAvatars, setLikersAvatars] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<ComunicadoComment[]>([]);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [openReactionPicker, setOpenReactionPicker] = useState<string | number | null>(
    null,
  );
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const [replyingTo, setReplyingTo] = useState<{
    id: string | number;
    author: string;
  } | null>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastProcessedTokenRef = useRef<number | null>(null);
  const onCommentCountChangeRef = useRef(onCommentCountChange);
  onCommentCountChangeRef.current = onCommentCountChange;

  const EMOJIS = [
    "😀",
    "😂",
    "😍",
    "🥰",
    "😎",
    "🤔",
    "😅",
    "🙏",
    "👏",
    "🎉",
    "🔥",
    "❤️",
    "👍",
    "👎",
    "😢",
    "😡",
    "🤣",
    "😊",
    "🥳",
    "💪",
    "✨",
    "🚀",
    "💯",
    "🎯",
    "😴",
    "🤦",
    "🙌",
    "💡",
    "⭐",
    "🏆",
    "😘",
    "🫡",
    "🤩",
    "🥹",
    "😤",
    "🫶",
    "🤝",
    "👀",
    "💬",
    "🎊",
  ];

  const insertEmoji = (emoji: string) => {
    const el = commentInputRef.current;
    if (!el) {
      setNewComment((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? newComment.length;
    const end = el.selectionEnd ?? newComment.length;
    const updated = newComment.slice(0, start) + emoji + newComment.slice(end);
    setNewComment(updated);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  const userAvatar =
    userProfile?.avatar ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || "User"}`;

  const [lastDataId, setLastDataId] = useState(data.id);
  if (data.id !== lastDataId) {
    setLikes(data.likedBy?.length ?? data.likes ?? 0);
    setInteraction(
      currentUserId && data.likedBy.includes(currentUserId) ? "like" : null,
    );
    setLastDataId(data.id);
  }

  useEffect(() => {
    if (!data.likedBy || data.likedBy.length === 0) {
      setLikersAvatars([]);
      return;
    }
    const cache = getUserCache();
    const sortedIds = [...data.likedBy].reverse().slice(0, 5);
    let finalAvatars = sortedIds
      .map((id) => cache[id])
      .filter(Boolean)
      .map(
        (u) =>
          u.avatar ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`,
      );
    if (currentUserId && data.likedBy.includes(currentUserId)) {
      if (!finalAvatars.includes(userAvatar)) {
        finalAvatars = [userAvatar, ...finalAvatars].slice(0, 5);
      }
    }
    setLikersAvatars(finalAvatars);
  }, [data.likedBy, currentUserId, userAvatar]);

  useEffect(() => {
    setCommentCount(initialCommentCount);
  }, [initialCommentCount]);

  const fetchComments = useCallback(async () => {
    setLoadingComments(true);
    const { data: rows } = await supabase
      .from("comunicado_comentarios")
      .select("id, content, created_at, user_id, likes, liked_by, reactions, parent_id")
      .eq("comunicado_id", data.dbId)
      .order("created_at", { ascending: true });

    interface DbCommentRow {
      id: string | number;
      content: string;
      created_at: string;
      user_id: string;
      likes?: number;
      liked_by?: string[];
      reactions?: Record<string, string[]>;
      parent_id?: string | number | null;
    }

    if (rows && rows.length > 0) {
      const commentRows = rows as unknown as DbCommentRow[];
      const cache = getUserCache();
      const missingIds = [...new Set(commentRows.map((r) => r.user_id))].filter(
        (id) => !cache[id],
      );

      if (missingIds.length > 0) {
        const { data: users } = await supabase
          .from("usuarios")
          .select("id, name, avatar")
          .in("id", missingIds);
        if (users) {
          users.forEach((u) => {
            cache[u.id] = u;
          });
        }
      }

      const mapped: ComunicadoComment[] = commentRows.map((c) => {
        const user = cache[c.user_id];
        return {
          id: c.id,
          content: c.content,
          author: user?.name || "Usuário",
          authorAvatar:
            user?.avatar ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.user_id}`,
          date: new Date(c.created_at).toLocaleDateString("pt-BR"),
          userId: c.user_id,
          likes: c.likes || 0,
          liked_by: c.liked_by || [],
          reactions: c.reactions || {},
          parent_id: c.parent_id ?? null,
          replies: [],
        };
      });

      const topLevel: ComunicadoComment[] = [];
      const byId = new Map<string | number, ComunicadoComment>(
        mapped.map((c) => [c.id, c]),
      );
      for (const c of mapped) {
        if (c.parent_id !== null && byId.has(c.parent_id)) {
          byId.get(c.parent_id)!.replies.push(c);
        } else {
          topLevel.push(c);
        }
      }

      setComments(topLevel);
      const newCount = mapped.length;
      setCommentCount(newCount);
      onCommentCountChangeRef.current?.(data.dbId, newCount);
    } else {
      setComments([]);
      setCommentCount(0);
      onCommentCountChangeRef.current?.(data.dbId, 0);
    }
    setLoadingComments(false);
  }, [data.dbId]);

  // Abre comentários, busca do Supabase e foca input quando chegou via notificação (executa uma única vez por clique)
  useEffect(() => {
    if (!openRequest) return;
    if (openRequest.token === lastProcessedTokenRef.current) return;
    lastProcessedTokenRef.current = openRequest.token;

    setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    if (openRequest.openComments) {
      setShowComments(true);
      fetchComments();
      setTimeout(() => {
        commentInputRef.current?.focus();
      }, 350);
    }
  }, [openRequest, fetchComments]);

  const handleToggleComments = () => {
    if (!showComments) fetchComments();
    setShowComments((prev) => !prev);
    setTimeout(() => commentInputRef.current?.focus(), 100);
  };

  const handleAddComment = async () => {
    if (!currentUserId || !newComment.trim() || submittingComment) return;
    setSubmittingComment(true);
    const payload: Record<string, unknown> = {
      comunicado_id: data.dbId,
      user_id: currentUserId,
      content: newComment.trim(),
    };
    if (replyingTo) payload.parent_id = replyingTo.id;
    const { error } = await supabase
      .from("comunicado_comentarios")
      .insert([payload]);
    if (!error) {
      setNewComment("");
      setReplyingTo(null);
      await fetchComments();

      // ── Notificações ──────────────────────────────────────────────────────
      const commenterName = userProfile?.name || "Alguém";
      const commenterAvatar = userProfile?.avatar ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${commenterName}`;
      const postTitle = data.title.length > 40
        ? data.title.slice(0, 40) + "..."
        : data.title;

      // Resolve o homenageado (inclusive por busca automática no título se nulo)
      const targetUserId = await resolveTaggedUserId(data);

      // Destinatários únicos: homenageado + autor + autor do comentário pai (se reply), excluindo o próprio autor da ação
      const recipients = new Set<string>();
      if (targetUserId && targetUserId !== currentUserId)
        recipients.add(targetUserId);
      if (data.postUserId && data.postUserId !== currentUserId)
        recipients.add(data.postUserId);


      if (recipients.size > 0) {
        const notifRows = Array.from(recipients).map((uid) => ({
          user_id: uid,
          type: "comment",
          title: "💬 Novo comentário no seu comunicado",
          message: `${commenterName} comentou em "${postTitle}"`,
          data: {
            comunicado_id: data.dbId,
            commenter_name: commenterName,
            commenter_avatar: commenterAvatar,
          },
        }));
        try {
          await supabase.from("notificacoes").insert(notifRows);
        } catch {
          /* ignora — não bloqueia o fluxo principal */
        }
      }
    }
    setSubmittingComment(false);
  };



  const findComment = (list: ComunicadoComment[], id: string | number): ComunicadoComment | undefined => {
    for (const c of list) {
      if (String(c.id) === String(id)) return c;
      const found = findComment(c.replies, id);
      if (found) return found;
    }
    return undefined;
  };

  const updateCommentDeep = (list: ComunicadoComment[], id: string | number, patch: Partial<ComunicadoComment>): ComunicadoComment[] =>
    list.map((c) =>
      String(c.id) === String(id)
        ? { ...c, ...patch }
        : { ...c, replies: updateCommentDeep(c.replies, id, patch) },
    );

  const persistCommentUpdate = async (
    commentId: string | number,
    patch: { likes: number; liked_by: string[]; reactions: Record<string, string[]> },
    prevComments: ComunicadoComment[],
  ) => {
    const { data: updated, error } = await supabase
      .from("comunicado_comentarios")
      .update(patch)
      .eq("id", commentId)
      .select("id");
    if (error) {
      console.error("Erro ao salvar reação/like:", error);
      setComments(prevComments);
      return;
    }
    // Nenhuma linha atualizada = id não bateu ou RLS bloqueou: reverte para não mostrar algo que não foi salvo
    if (!updated || updated.length === 0) {
      console.error("Reação/like não persistida (0 linhas atualizadas)", commentId);
      setComments(prevComments);
    }
  };

  const handleCommentLike = async (
    commentId: string | number,
    currentLikedBy: string[],
    currentLikes: number,
  ) => {
    if (!currentUserId) return;

    const isLiking = !currentLikedBy.includes(currentUserId);
    const newLikedBy = isLiking
      ? [...currentLikedBy, currentUserId]
      : currentLikedBy.filter((id) => id !== currentUserId);
    const newLikes = isLiking
      ? currentLikes + 1
      : Math.max(0, currentLikes - 1);

    const comment = findComment(comments, commentId);
    const newReactions = { ...(comment?.reactions || {}) };
    if (isLiking) {
      Object.keys(newReactions).forEach((e) => {
        if (newReactions[e].includes(currentUserId)) {
          newReactions[e] = newReactions[e].filter(
            (id) => id !== currentUserId,
          );
          if (newReactions[e].length === 0) delete newReactions[e];
        }
      });
    }

    const prev = comments;
    setComments((p) =>
      updateCommentDeep(p, commentId, {
        likes: newLikes,
        liked_by: newLikedBy,
        reactions: newReactions,
      }),
    );

    await persistCommentUpdate(commentId, {
      likes: newLikes,
      liked_by: newLikedBy,
      reactions: newReactions,
    }, prev);
  };

  const handleCommentReaction = async (
    commentId: string | number,
    emoji: string,
    currentReactions: Record<string, string[]>,
  ) => {
    if (!currentUserId) return;

    const newReactions = { ...currentReactions };
    let hadThisReactionAlready = false;

    Object.keys(newReactions).forEach((e) => {
      if (newReactions[e].includes(currentUserId)) {
        if (e === emoji) hadThisReactionAlready = true;
        newReactions[e] = newReactions[e].filter((id) => id !== currentUserId);
        if (newReactions[e].length === 0) delete newReactions[e];
      }
    });

    if (!hadThisReactionAlready) {
      if (!newReactions[emoji]) newReactions[emoji] = [];
      newReactions[emoji].push(currentUserId);
    }

    const comment = findComment(comments, commentId);
    let newLikedBy = [...(comment?.liked_by || [])];
    let newLikes = comment?.likes || 0;

    if (!hadThisReactionAlready && newLikedBy.includes(currentUserId)) {
      newLikedBy = newLikedBy.filter((id) => id !== currentUserId);
      newLikes = Math.max(0, newLikes - 1);
    }

    const prev = comments;
    setComments((p) =>
      updateCommentDeep(p, commentId, {
        reactions: newReactions,
        likes: newLikes,
        liked_by: newLikedBy,
      }),
    );

    await persistCommentUpdate(commentId, {
      reactions: newReactions,
      likes: newLikes,
      liked_by: newLikedBy,
    }, prev);
  };

  const handleLike = async () => {
    if (!currentUserId) return;
    const isLiking = interaction !== "like";
    const newLikesCount = isLiking ? likes + 1 : Math.max(0, likes - 1);
    setLikes(newLikesCount);
    setInteraction(isLiking ? "like" : null);
    if (isLiking) {
      setLikersAvatars((prev) =>
        [userAvatar, ...prev.filter((a) => a !== userAvatar)].slice(0, 5),
      );
    } else {
      setLikersAvatars((prev) => prev.filter((a) => a !== userAvatar));
    }
    try {
      const { data: currentPost } = await supabase
        .from("comunicados")
        .select("liked_by")
        .eq("id", data.dbId)
        .maybeSingle();
      let newLikedBy = currentPost?.liked_by || [];
      if (isLiking) {
        if (!newLikedBy.includes(currentUserId)) newLikedBy.push(currentUserId);
      } else {
        newLikedBy = newLikedBy.filter((id: string) => id !== currentUserId);
      }
      // Contagem sempre derivada do array para manter likes e liked_by consistentes
      setLikes(newLikedBy.length);
      await supabase
        .from("comunicados")
        .update({ likes: newLikedBy.length, liked_by: newLikedBy })
        .eq("id", data.dbId);

      // ── Notificação de curtida ────────────────────────────────────────────
      // Notifica: homenageado (taggedUserId) + autor (postUserId), excluindo o próprio liker
      if (isLiking) {
        const likerName = userProfile?.name || "Alguém";
        const likerAvatar = userProfile?.avatar ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${likerName}`;
        const postTitle = data.title.length > 40
          ? data.title.slice(0, 40) + "..."
          : data.title;

        // Resolve homenageado
        const targetUserId = await resolveTaggedUserId(data);

        const recipients = new Set<string>();
        if (targetUserId && targetUserId !== currentUserId)
          recipients.add(targetUserId);
        if (data.postUserId && data.postUserId !== currentUserId)
          recipients.add(data.postUserId);

        if (recipients.size > 0) {
          try {
            await supabase.from("notificacoes").insert(
              Array.from(recipients).map((uid) => ({
                user_id: uid,
                type: "like",
                title: "👍 Curtida no seu comunicado",
                message: `${likerName} curtiu "${postTitle}"`,
                data: {
                  comunicado_id: data.dbId,
                  commenter_name: likerName,
                  commenter_avatar: likerAvatar,
                },
              }))
            );
          } catch {
            /* ignora — não bloqueia o fluxo principal */
          }
        }
      }


    } catch (error) {
      console.error("Erro ao sincronizar curtida:", error);
    }
  };


  const handleHide = () => {
    if (
      confirm(
        "Deseja ocultar este comunicado? Você não o verá novamente nesta sessão.",
      )
    ) {
      onHide(data.dbId);
    }
  };

  return (
    <div ref={cardRef} className="bg-card border border-border rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg group">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-start p-2.5 sm:p-3 gap-2.5">
        <div
          onClick={() => setShowImageModal(true)}
          className="w-full sm:w-52 md:w-60 aspect-square shrink-0 rounded-xl bg-slate-900/40 dark:bg-slate-950/60 border border-border overflow-hidden relative cursor-pointer group/img select-none flex items-center justify-center sm:self-start shadow-sm"
          title="Clique para ver a foto ampliada"
        >
          {!imageLoaded && (
            <div className="absolute inset-0 bg-slate-200 dark:bg-slate-800 animate-pulse flex items-center justify-center z-10">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-400 dark:border-slate-700 dark:border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
          {/* Fundo suave com blur para banners ou imagens que não sejam 1:1 */}
          <img
            src={data.image}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover blur-lg scale-125 opacity-25 pointer-events-none"
          />
          <img
            key={data.image}
            src={data.image}
            alt={data.title}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
            className={cn(
              "w-full h-full object-contain relative z-[1]",
              "group-hover/img:scale-105 transition-transform duration-500",
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 z-[2] flex items-end justify-start p-2.5 pointer-events-none">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg shadow border border-white/10">
              <Maximize2 className="w-3 h-3" /> Ampliar
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-[190px] sm:min-h-[220px] justify-between py-0.5">
          <div className="flex justify-between items-start gap-4 mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-black px-3 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 uppercase tracking-widest">
                {data.category}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-500 font-bold">
                {data.date}
              </span>
            </div>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
              <button
                onClick={handleHide}
                className="p-2 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-secondary rounded-xl transition-all"
                title="Ocultar Comunicado"
              >
                <EyeOff className="w-4 h-4" />
              </button>
              {canManage && (
                <button
                  onClick={() => onEdit(data)}
                  className="p-2 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-secondary rounded-xl transition-all"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <h3 className="text-lg font-black text-foreground tracking-tight mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors uppercase">
            {data.title}
          </h3>

          {data.title.includes("ALTERACOES DE PRECO") ? (
            /* Comunicado de alteração de preço: renderização estruturada por produto */
            <PriceChangeContent content={data.content} />
          ) : data.content.startsWith("Chegou material do fornecedor") ? (
            /* Comunicado de recebimento de material: itens agrupados por nota fiscal */
            <MaterialReceivedContent content={data.content} />
          ) : (
            /* Comunicados normais: expandir/recolher ao clicar */
            <div
              onClick={() => setIsExpanded(!isExpanded)}
              className="cursor-pointer group/content"
            >
              <p
                className={cn(
                  "text-sm text-slate-600 dark:text-muted-foreground leading-relaxed font-medium mb-1 transition-all duration-300 whitespace-pre-wrap",
                  !isExpanded && "line-clamp-3",
                )}
              >
                {data.content}
              </p>
              {data.content.length > 150 && (
                <button className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 hover:underline mb-4">
                  {isExpanded ? "Ver menos" : "Ver mais..."}
                </button>
              )}
            </div>
          )}

          <div className="mt-auto flex items-center justify-between pt-4 border-t border-border">
            <div className="flex items-center gap-3">
              <button
                onClick={handleLike}
                className={cn(
                  "flex items-center gap-2 text-xs font-black transition-all transform active:scale-95 px-3 py-1.5 rounded-xl",
                  interaction === "like"
                    ? "bg-blue-600 dark:bg-blue-500/20 text-white dark:text-blue-400 shadow-lg shadow-blue-600/20 dark:shadow-none"
                    : "text-slate-400 dark:text-muted-foreground hover:text-slate-600 dark:hover:text-foreground hover:bg-slate-50 dark:hover:bg-secondary",
                )}
              >
                <ThumbsUp
                  className={cn(
                    "w-4 h-4",
                    interaction === "like" && "fill-white dark:fill-current",
                  )}
                />
                {likes}
              </button>
              <button
                onClick={handleToggleComments}
                className={cn(
                  "flex items-center gap-2 text-xs font-black transition-all transform active:scale-95 px-3 py-1.5 rounded-xl",
                  showComments
                    ? "bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                    : "text-slate-400 dark:text-muted-foreground hover:text-slate-600 dark:hover:text-foreground hover:bg-slate-50 dark:hover:bg-secondary",
                )}
              >
                <MessageCircle
                  className={cn(
                    "w-4 h-4",
                    showComments && "fill-slate-400 dark:fill-slate-400",
                  )}
                />
                {commentCount}
              </button>
              <div className="flex items-center -space-x-2">
                {likersAvatars.map((url, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-card overflow-hidden bg-slate-100 dark:bg-slate-800 ring-1 ring-border shadow-sm transition-transform hover:scale-110 hover:z-10"
                  >
                    <img
                      src={url}
                      className="w-full h-full object-cover"
                      alt="liker"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 bg-secondary/50 px-3 py-1.5 rounded-xl border border-border">
              <img
                src={data.authorAvatar}
                className="w-7 h-7 rounded-full shadow-sm object-cover"
                alt={data.author}
              />
              <div className="flex flex-col leading-none text-left">
                <span className="text-[10px] font-black text-foreground uppercase tracking-tighter truncate max-w-[80px]">
                  {data.author}
                </span>
                <span className="text-[9px] font-bold text-slate-500 dark:text-muted-foreground uppercase">
                  Autor
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showComments && (
        <div className="border-t border-border bg-secondary/20 dark:bg-slate-800/20 px-6 py-4 flex flex-col gap-3">
          {loadingComments ? (
            <div className="flex flex-col gap-1.5">
              {[1, 2].map((i) => (
                <div key={i} className="flex gap-2 items-start animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-secondary dark:bg-slate-700 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 bg-secondary dark:bg-slate-700 rounded" />
                    <div className="h-4 w-full bg-secondary dark:bg-slate-700 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {comments.map((comment) => (
                <CommentBubble
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  openReactionPicker={openReactionPicker}
                  setOpenReactionPicker={setOpenReactionPicker}
                  reactionPickerRef={reactionPickerRef}
                  onLike={handleCommentLike}
                  onReaction={handleCommentReaction}
                  onReply={(id, author) => {
                    setReplyingTo({ id, author });
                    setTimeout(() => replyInputRef.current?.focus(), 50);
                  }}
                  replyingToId={replyingTo?.id ?? null}
                />
              ))}
            </div>
          ) : null}

          {currentUserId && (
            <div className="flex flex-col gap-1.5 pt-1">
              {replyingTo && (
                <div className="flex items-center gap-2 ml-10 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold flex-1">
                    Respondendo a {replyingTo.author}
                  </span>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="text-blue-400 hover:text-blue-600 text-xs font-black"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <img
                  src={userAvatar}
                  className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-border shadow-sm"
                  alt={userProfile?.name}
                />
                <div className="flex-1 flex gap-2">
                  <div className="flex-1 relative" ref={emojiPickerRef}>
                    <div className="flex items-center bg-card border border-border rounded-xl focus-within:ring-1 focus-within:ring-blue-500">
                      <textarea
                        ref={replyingTo ? replyInputRef : commentInputRef}
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment();
                          }
                        }}
                        placeholder={
                          replyingTo
                            ? `Responder ${replyingTo.author}...`
                            : "Escreva um comentário..."
                        }
                        rows={1}
                        disabled={submittingComment}
                        className="flex-1 pl-4 py-2.5 bg-transparent text-xs font-medium text-foreground outline-none resize-none placeholder:text-muted-foreground/40 leading-relaxed"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker((prev) => !prev)}
                        className={cn(
                          "shrink-0 px-2.5 py-2.5 rounded-r-xl transition-colors",
                          showEmojiPicker
                            ? "text-yellow-500"
                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300",
                        )}
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                    </div>
                    {showEmojiPicker && (
                      <div className="absolute bottom-full right-0 mb-2 bg-card border border-border rounded-xl shadow-xl p-2 grid grid-cols-8 gap-0.5 z-50 w-64">
                        {EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => insertEmoji(emoji)}
                            className="text-base hover:bg-secondary rounded-lg p-1 transition-colors leading-none"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || submittingComment}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all active:scale-95 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lightbox / Modal de Foto Ampliada */}
      {showImageModal && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setShowImageModal(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowImageModal(false);
            }}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2.5 bg-black/60 hover:bg-black/90 text-white rounded-full transition-colors border border-white/20 z-10"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={data.image}
              alt={data.title}
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10"
            />
            <div className="mt-3 text-center px-4">
              <span className="inline-block text-[10px] font-black uppercase tracking-wider text-blue-400 bg-blue-950/60 border border-blue-800/60 px-2.5 py-0.5 rounded-md mb-1">
                {data.category}
              </span>
              <p className="text-white font-bold text-sm line-clamp-1">{data.title}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CommunicationSection({
  userProfile,
  loading: externalLoading,
}: {
  userProfile?: UserProfile;
  loading?: boolean;
}) {
  const { showNotification } = useNotification();
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [comms, setComms] = useState<CommunicationPost[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const handleCommentCountChange = useCallback((dbId: string | number, count: number) => {
    setCommentCounts((prev) => {
      if (prev[String(dbId)] === count) return prev;
      return { ...prev, [String(dbId)]: count };
    });
  }, []);

  const canManage =
    userProfile?.is_leader ||
    userProfile?.role === "admin";
  // Mostra o skeleton tanto no boot (externalLoading) quanto quando os comunicados
  // estão sendo (re)carregados — ex.: ao voltar para a seção Geral, que remonta a
  // seção e refaz o fetch.
  const loading = !!externalLoading || internalLoading;
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [hiddenPosts, setHiddenPosts] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("carflax_hidden_comms");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleHidePost = (id: string | number) => {
    const idStr = String(id);
    const newHidden = [...hiddenPosts, idStr];
    setHiddenPosts(newHidden);
    localStorage.setItem("carflax_hidden_comms", JSON.stringify(newHidden));
  };

  const fetchComunicados = useCallback(async (silent = false) => {
    if (!silent) setInternalLoading(true);
    const { data, error } = await supabase
      .from("comunicados")
      .select(
        `
        *,
        usuarios (
          name,
          avatar
        ),
        comunicado_comentarios (count)
      `,
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const counts: Record<string, number> = {};
      const posts = (data as unknown as (DbComunicado & { comunicado_comentarios: { count: number }[] })[]).map((c) => {
        const count = c.comunicado_comentarios?.[0]?.count ?? 0;
        counts[String(c.id)] = count;
        return {
          id: String(c.id),
          dbId: String(c.id),
          title: c.titulo,
          content: c.descricao || "",
          category: c.filtro || "Empresa",
          author: c.usuarios?.name || c.tag || "Carflax",
          authorAvatar:
            c.usuarios?.avatar ||
            (c.tag === "Carflax"
              ? "https://zwfvrmqffxcqurxpfewi.supabase.co/storage/v1/object/public/avatares/Carflax.jpg"
              : `https://api.dicebear.com/7.x/identicon/svg?seed=${c.tag || "carflax"}`),
          date: new Date(c.created_at).toLocaleDateString("pt-BR"),
          image:
            (c.image_url || c.image || "").trim() ||
            `https://api.dicebear.com/7.x/shapes/svg?seed=${c.id}`,
          likes: c.likes || 0,
          likedBy: c.liked_by || [],
          taggedUserId: c.tagged_user_id || null,
          postUserId: c.user_id || null,
        };
      });
      setComms(posts);
      setCommentCounts(counts);
    }
    setInternalLoading(false);
  }, []);

  useEffect(() => {
    fetchComunicados();
  }, [fetchComunicados]);

  // Atualiza automaticamente o feed de comunicados quando um novo comunicado for publicado
  useEffect(() => {
    const handleNovoComunicado = () => {
      fetchComunicados(true);
    };
    window.addEventListener("carflax-novo-comunicado", handleNovoComunicado);
    return () => window.removeEventListener("carflax-novo-comunicado", handleNovoComunicado);
  }, [fetchComunicados]);

  const [newPost, setNewPost] = useState<{
    title: string;
    content: string;
    category: string;
    image: string;
    _imageFile?: File;
    tagged_user_id?: string | null;
  }>(() => ({
    title: "",
    content: "",
    category: "Empresa",
    image: "",
    tagged_user_id: null,
  }));

  // Estado para busca de homenageado no modal
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<{ id: string; name: string; avatar: string | null }[]>([]);
  const [selectedTaggedUser, setSelectedTaggedUser] = useState<{ id: string; name: string; avatar: string | null } | null>(null);
  const userSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUserSearch = (query: string) => {
    setUserSearchQuery(query);
    if (userSearchTimeoutRef.current) clearTimeout(userSearchTimeoutRef.current);
    if (!query.trim()) { setUserSearchResults([]); return; }
    userSearchTimeoutRef.current = setTimeout(async () => {
      const { data: users } = await supabase
        .from("usuarios")
        .select("id, name, avatar")
        .ilike("name", `%${query}%`)
        .limit(6);
      setUserSearchResults(users || []);
    }, 300);
  };

  const handleAddPost = async () => {
    if (!newPost.title || !newPost.content) return;
    setSaving(true);
    try {
      let finalImageUrl = newPost.image || "";
      if (newPost._imageFile) {
        const uploadedUrl = await uploadImage(
          newPost._imageFile,
          "Comunicados",
        );
        if (uploadedUrl) finalImageUrl = uploadedUrl;
      }

      const payload = {
        titulo: newPost.title.toUpperCase(),
        descricao: newPost.content,
        filtro: newPost.category,
        image_url: finalImageUrl,
        tag: userProfile?.name || "Danilo",
        user_id: userProfile?.id,
        tagged_user_id: selectedTaggedUser?.id || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("comunicados")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        showNotification(
          "success",
          "Comunicado Atualizado",
          "As alterações foram salvas com sucesso!",
        );
      } else {
        const { error } = await supabase
          .from("comunicados")
          .insert([{ ...payload, likes: 0, liked_by: [] }]);
        if (error) throw error;
        showNotification(
          "success",
          "Publicado!",
          "O novo comunicado já está disponível no feed.",
        );
      }

      await fetchComunicados(true);
      setIsModalOpen(false);
      setEditingId(null);
      setNewPost({ title: "", content: "", category: "Empresa", image: "", tagged_user_id: null });
      setSelectedTaggedUser(null);
      setUserSearchQuery("");
      setUserSearchResults([]);
    } catch (err) {
      console.error(err);
      showNotification(
        "error",
        "Erro ao Salvar",
        "Ocorreu um problema ao sincronizar com o banco.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    if (
      !confirm(
        "Tem certeza que deseja excluir este comunicado permanentemente?",
      )
    )
      return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("comunicados")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", editingId);
      if (error) throw error;

      showNotification(
        "success",
        "Comunicado Removido",
        "O post foi excluído do feed.",
      );
      await fetchComunicados(true);
      setIsModalOpen(false);
      setEditingId(null);
    } catch (err) {
      console.error(err);
      showNotification(
        "error",
        "Erro ao Excluir",
        "Não foi possível remover o comunicado.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (data: CommunicationPost) => {
    setNewPost({
      title: data.title,
      content: data.content,
      category: data.category,
      image: data.image,
    });
    setEditingId(data.dbId);
    setIsModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewPost((p) => ({
      ...p,
      image: URL.createObjectURL(file),
      _imageFile: file,
    }));
  };

  // Preferências de notificação do usuário (o que ele quer ver no feed).
  const equipePrefs = useMemo<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("carflax_notif_prefs");
      return raw ? (JSON.parse(raw)?.equipe ?? {}) : {};
    } catch {
      return {};
    }
  }, []);

  const filtered = (
    activeCategory === "Todos"
      ? comms
      : comms.filter((c) => c.category === activeCategory)
  )
    .filter((c) => !hiddenPosts.includes(String(c.dbId)))
    .filter((c) => isCommVisibleForPrefs(c, equipePrefs));

  const [openRequest, setOpenRequest] = useState<{ id: string; openComments: boolean; token: number } | null>(null);

  // Listener: navega ao card quando notificação é clicada
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; openComments: boolean }>).detail;
      if (!detail) return;
      setActiveCategory("Todos");
      setOpenRequest({ id: String(detail.id), openComments: !!detail.openComments, token: Date.now() });
    };
    window.addEventListener("carflax-open-comunicado", handler);
    return () => window.removeEventListener("carflax-open-comunicado", handler);
  }, []);

  return (
    <div className="flex flex-col relative">
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/40">
          <div
            className="fixed inset-0"
            onClick={() => !saving && setIsModalOpen(false)}
          />
          <div className="relative bg-card w-full max-w-4xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
            <div className="w-full md:w-80 bg-secondary/30 dark:bg-slate-800/50 p-8 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-border shrink-0">
              <div className="w-40 h-40 md:w-56 md:h-56 rounded-2xl border-4 border-card shadow-xl overflow-hidden mb-6 group relative bg-card flex items-center justify-center">
                <img
                  src={
                    newPost.image ||
                    "https://api.dicebear.com/7.x/shapes/svg?seed=placeholder"
                  }
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  alt="Preview"
                />
                <label className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer backdrop-blur-[2px]">
                  <ImageIcon className="w-8 h-8 text-white mb-2" />
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">
                    Alterar Imagem
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageChange}
                  />
                </label>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  document
                    .querySelector<HTMLInputElement>('input[type="file"]')
                    ?.click()
                }
                disabled={saving}
                className="font-bold text-xs h-10 px-6 rounded-xl"
              >
                SELECIONAR FOTO
              </Button>
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              <div className="p-8 border-b border-border flex items-center justify-between">
                <h2 className="text-xl font-black text-foreground tracking-tight uppercase">
                  {editingId ? "EDITAR COMUNICADO" : "NOVO COMUNICADO"}
                </h2>
                {!saving && (
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 hover:bg-secondary/50 rounded-xl text-muted-foreground transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="p-8 overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                      Assunto do Post
                    </label>
                    <input
                      type="text"
                      value={newPost.title}
                      onChange={(e) =>
                        setNewPost({ ...newPost, title: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-secondary/20 border border-border rounded-xl text-sm font-bold text-foreground outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-muted-foreground/30"
                      placeholder="Título impactante..."
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                      Categoria de Filtro
                    </label>
                    <TinyDropdown
                      value={newPost.category}
                      options={categories.filter((c) => c !== "Todos")}
                      onChange={(val) =>
                        setNewPost({ ...newPost, category: val })
                      }
                      icon={Tag}
                      variant="blue"
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                    Conteúdo do Comunicado
                  </label>
                  <textarea
                    value={newPost.content}
                    onChange={(e) =>
                      setNewPost({ ...newPost, content: e.target.value })
                    }
                    rows={6}
                    className="w-full p-4 bg-secondary/20 border border-border rounded-xl text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-blue-500 resize-none placeholder:text-muted-foreground/30"
                    placeholder="O que você quer contar para a equipe?"
                    disabled={saving}
                  />
                </div>
                {/* Campo de homenageado */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 flex items-center gap-1.5">
                    🎯 Homenageado <span className="text-muted-foreground/50 normal-case font-medium">(opcional)</span>
                  </label>
                  {selectedTaggedUser ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                      <img
                        src={selectedTaggedUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedTaggedUser.name}`}
                        className="w-8 h-8 rounded-full object-cover"
                        alt={selectedTaggedUser.name}
                      />
                      <span className="text-sm font-bold text-foreground flex-1">{selectedTaggedUser.name}</span>
                      <button
                        type="button"
                        onClick={() => { setSelectedTaggedUser(null); setUserSearchQuery(""); setUserSearchResults([]); }}
                        className="p-1 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                        disabled={saving}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={userSearchQuery}
                        onChange={(e) => handleUserSearch(e.target.value)}
                        className="w-full px-4 py-3 bg-secondary/20 border border-border rounded-xl text-sm font-bold text-foreground outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-muted-foreground/30"
                        placeholder="Buscar colaborador homenageado..."
                        disabled={saving}
                      />
                      {userSearchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                          {userSearchResults.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setSelectedTaggedUser(u);
                                setUserSearchQuery("");
                                setUserSearchResults([]);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left"
                            >
                              <img
                                src={u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`}
                                className="w-7 h-7 rounded-full object-cover"
                                alt={u.name}
                              />
                              <span className="text-sm font-bold text-foreground">{u.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-8 bg-secondary/50 border-t border-border flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  {editingId && (
                    <Button
                      variant="ghost"
                      onClick={handleDelete}
                      disabled={saving}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 font-black text-xs h-11 px-6 rounded-xl"
                    >
                      EXCLUIR
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => setIsModalOpen(false)}
                    disabled={saving}
                    className="font-bold text-xs h-11 px-6"
                  >
                    CANCELAR
                  </Button>
                </div>

                <Button
                  onClick={handleAddPost}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs px-10 rounded-xl h-11 shadow-lg shadow-blue-600/20"
                >
                  {saving
                    ? "PROCESSANDO..."
                    : editingId
                      ? "SALVAR ALTERAÇÕES"
                      : "PUBLICAR AGORA"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pb-3 border-b border-border mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 flex-wrap">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-7 w-16 bg-secondary dark:bg-slate-800/80 rounded-md animate-pulse"
                />
              ))
            : categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-md transition-all",
                    activeCategory === cat
                      ? "bg-slate-100 dark:bg-blue-500/20 text-slate-900 dark:text-blue-400 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-50 dark:hover:bg-secondary/50",
                  )}
                >
                  {cat}
                </button>
              ))}
        </div>
        {loading ? (
          <div className="h-9 w-40 bg-secondary dark:bg-slate-800/80 rounded-md animate-pulse shadow-sm" />
        ) : canManage ? (
          <Button
            onClick={() => {
              setEditingId(null);
              setNewPost({
                title: "",
                content: "",
                category: "Empresa",
                image: "",
                tagged_user_id: null,
              });
              setSelectedTaggedUser(null);
              setUserSearchQuery("");
              setUserSearchResults([]);
              setIsModalOpen(true);
            }}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md h-9 px-4 text-[11px] font-bold shadow-sm group"
          >
            <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform" />{" "}
            NOVO COMUNICADO
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col sm:flex-row items-stretch sm:items-start p-2.5 sm:p-3 gap-2.5 animate-pulse"
            >
              <div className="w-full sm:w-52 md:w-60 aspect-square shrink-0 rounded-xl bg-secondary dark:bg-slate-800/50" />
              <div className="flex-1 flex flex-col gap-3 w-full justify-between min-h-[190px] sm:min-h-[220px]">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-16 bg-secondary dark:bg-slate-800 rounded-lg" />
                  <div className="h-4 w-20 bg-secondary dark:bg-slate-800 rounded" />
                </div>
                <div className="h-6 w-3/4 bg-secondary dark:bg-slate-800/50 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <div className="h-3.5 w-full bg-secondary dark:bg-slate-800 rounded" />
                  <div className="h-3.5 w-full bg-secondary dark:bg-slate-800 rounded" />
                  <div className="h-3.5 w-2/3 bg-secondary dark:bg-slate-800 rounded" />
                </div>
                <div className="pt-4 border-t border-border flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-16 bg-secondary dark:bg-slate-800 rounded-xl" />
                    <div className="h-8 w-16 bg-secondary dark:bg-slate-800 rounded-xl" />
                    <div className="flex -space-x-2">
                      {[1, 2, 3].map((j) => (
                        <div key={j} className="w-8 h-8 rounded-full bg-secondary dark:bg-slate-800 border-2 border-card" />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-secondary/50 px-3 py-1.5 rounded-xl border border-border">
                    <div className="w-7 h-7 rounded-full bg-secondary dark:bg-slate-700" />
                    <div className="flex flex-col gap-1">
                      <div className="h-2.5 w-14 bg-secondary dark:bg-slate-700 rounded" />
                      <div className="h-2 w-8 bg-secondary dark:bg-slate-700 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        {!loading && filtered.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-8 font-bold text-slate-300">
            NADA POR ENQUANTO.
          </p>
        )}
        {!loading &&
          filtered.map((item) => (
            <div key={item.id} data-comunicado-id={String(item.dbId)}>
              <CommunicationCard
                data={item}
                onEdit={handleEdit}
                onHide={handleHidePost}
                userProfile={userProfile}
                initialCommentCount={commentCounts[String(item.dbId)] ?? 0}
                onCommentCountChange={handleCommentCountChange}
                openRequest={
                  openRequest?.id === String(item.dbId) || openRequest?.id === String(item.id)
                    ? openRequest
                    : null
                }
              />
            </div>
          ))}
      </div>
    </div>
  );
}
