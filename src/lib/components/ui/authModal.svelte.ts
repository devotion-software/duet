class AuthModalStore {
	open = $state(false);

	show() {
		this.open = true;
	}

	hide() {
		this.open = false;
	}
}

export const authModal = new AuthModalStore();
