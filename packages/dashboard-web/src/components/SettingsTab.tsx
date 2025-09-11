import { PinSetupForm } from "./unlock/PinSetupForm";

export function SettingsTab() {
    return (
        <div>
            <h2 className="text-2xl font-bold">Security Settings</h2>
            <div className="mt-4 space-y-4">
                <div>
                    <h3 className="text-lg font-medium">PIN</h3>
                    <p className="text-sm text-muted-foreground">
                        Set a PIN to unlock your data.
                    </p>
                    <PinSetupForm />
                </div>
                <div>
                    <h3 className="text-lg font-medium">WebAuthn</h3>
                    <p className="text-sm text-muted-foreground">
                        Register a WebAuthn device to unlock your data.
                    </p>
                    {/* WebAuthn registration button will go here */}
                </div>
                <div>
                    <h3 className="text-lg font-medium">Recovery Code</h3>
                    <p className="text-sm text-muted-foreground">
                        Generate a recovery code to regain access to your data if you forget your PIN or lose your WebAuthn device.
                    </p>
                    {/* Recovery code generation button will go here */}
                </div>
            </div>
        </div>
    );
}
