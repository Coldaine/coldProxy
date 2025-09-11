import { startAuthentication } from "@simplewebauthn/browser";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useState } from "react";
import { api } from "../../api";

export function UnlockDialog({ open, onOpenChange }) {
	const [pin, setPin] = useState("");

	const handleUnlockWithPin = async () => {
		try {
			const { success } = await api.unlockWithPin("user1", pin); // TODO: get real userId
			if (success) {
				onOpenChange(false);
				// TODO: show success notification
			} else {
				// TODO: show error notification
			}
		} catch (error) {
			// TODO: show error notification
		}
	};

	const handleUnlockWithWebAuthn = async () => {
		try {
			const { options } = await api.getWebAuthnChallenge("user1"); // TODO: get real userId
			const assertion = await startAuthentication(options);
			const { success } = await api.unlockWithWebAuthn("user1", assertion);
			if (success) {
				onOpenChange(false);
				// TODO: show success notification
			} else {
				// TODO: show error notification
			}
		} catch (error) {
			// TODO: show error notification
		}
	};

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Unlock</DialogTitle>
                    <DialogDescription>
                        Enter your PIN or use WebAuthn to unlock your data.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Input
                        placeholder="PIN"
                        type="password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                    />
                    <Button onClick={handleUnlockWithPin}>Unlock with PIN</Button>
                    <Button variant="outline" onClick={handleUnlockWithWebAuthn}>Unlock with WebAuthn</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
