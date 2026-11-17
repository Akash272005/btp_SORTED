
import { Video, FileText, HelpCircle, Clock } from "lucide-react"

type ContentItem = {
    _id: string
    title: string
    createdAt: string
    type: "lecture" | "note" | "quiz"
}

export default function ContentList({ items }: { items: ContentItem[] }) {
    if (items.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground bg-accent/5 rounded-lg border border-dashed">
                <p>No recent uploads found.</p>
            </div>
        )
    }

    const getIcon = (type: string) => {
        switch (type) {
            case "lecture": return <Video size={16} className="text-blue-500" />
            case "note": return <FileText size={16} className="text-amber-500" />
            case "quiz": return <HelpCircle size={16} className="text-purple-500" />
            default: return <Clock size={16} />
        }
    }

    return (
        <div className="space-y-4">
            {items.map((item) => (
                <div
                    key={item._id}
                    className="flex items-center justify-between p-4 bg-card border rounded-lg hover:shadow-sm transition-shadow"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-background rounded-full border">
                            {getIcon(item.type)}
                        </div>
                        <div>
                            <p className="font-medium text-sm">{item.title}</p>
                            <p className="text-xs text-muted-foreground capitalize">{item.type}</p>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mr-2">
                        {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                </div>
            ))}
        </div>
    )
}
