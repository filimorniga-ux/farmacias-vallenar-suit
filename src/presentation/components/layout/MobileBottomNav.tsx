interface MobileBottomNavProps {
    onMenuClick: () => void;
}

export default function MobileBottomNav({ onMenuClick: _onMenuClick }: MobileBottomNavProps) {
    void _onMenuClick;
    return null;
}
