interface BottomNavigationProps {
    onMenuClick: () => void;
}

export default function BottomNavigation({ onMenuClick: _onMenuClick }: BottomNavigationProps) {
    void _onMenuClick;
    return null;
}
