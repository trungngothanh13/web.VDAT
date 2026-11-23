import { usePopoverMenu } from '../../hooks/usePopoverMenu';
import type { useAuth } from '../../hooks/useAuth';
import type { useAudioAlert } from '../../hooks/useAudioAlert';

type AuthHook = ReturnType<typeof useAuth>;
type AudioHook = ReturnType<typeof useAudioAlert>;

interface AppHeaderProps {
  auth: AuthHook;
  activeTab: 'monitor' | 'analytics';
  onTabChange: (nextTab: 'monitor' | 'analytics') => void;
  audio: AudioHook;
}

export function AppHeader({ auth, activeTab, onTabChange, audio }: AppHeaderProps) {
  const userMenu = usePopoverMenu({ alignEnd: true, deps: [activeTab] });

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="brand-bar">
          <button
            type="button"
            className="brand-home-btn"
            onClick={() => onTabChange('monitor')}
            title="Return to Live Monitor"
          >
            VDAT Surveillance Hub
          </button>
        </div>

        <nav className="toolbar-actions" aria-label="Account and workspace menu">
          <button
            ref={userMenu.triggerRef}
            id="user-menu-trigger"
            type="button"
            className="user-menu-trigger"
            aria-haspopup="menu"
            aria-expanded={userMenu.isOpen}
            {...({ commandfor: 'user-action-menu', command: 'toggle-popover' } as any)}
            onClick={userMenu.onTriggerClick}
          >
            <span>
              {auth.user?.fullName} ({auth.role})
            </span>
            <span aria-hidden="true">▾</span>
          </button>
          {/* Directly after trigger so browsers emit no implicit aria-details */}
          <div
            ref={userMenu.popoverRef}
            id="user-action-menu"
            {...({ popover: 'auto' } as any)}
            className="cam-dropdown-popover popover-align-end"
          >
            <div
              ref={userMenu.groupRef}
              {...({ focusgroup: 'menu nomemory' } as any)}
              aria-labelledby="user-menu-trigger"
              className="cam-dropdown-menu"
            >
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={activeTab === 'analytics'}
                onKeyDown={userMenu.onCheckboxKeyDown}
                onClick={() => {
                  onTabChange(activeTab === 'analytics' ? 'monitor' : 'analytics');
                  userMenu.closeAfterCheckboxAction();
                }}
              >
                <span>Fleet &amp; Analytics</span>
              </button>

              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={audio.soundAlertsEnabled}
                onKeyDown={userMenu.onCheckboxKeyDown}
                onClick={() => {
                  audio.setSoundAlertsEnabled(!audio.soundAlertsEnabled);
                  userMenu.closeAfterCheckboxAction();
                }}
              >
                <span>Audio Alerts</span>
              </button>

              <hr />

              <button
                type="button"
                className="menu-item-danger"
                onClick={() => {
                  userMenu.close(0);
                  auth.logout();
                }}
              >
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
