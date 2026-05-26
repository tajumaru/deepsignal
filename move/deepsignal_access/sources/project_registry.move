module deepsignal::project_registry {
    use deepsignal::access_control;
    use std::string::String;

    const E_GLOBAL_ADMIN_REQUIRED: u64 = 1;
    const E_PROJECT_OWNER_CAP_MISMATCH: u64 = 2;
    const E_PROJECT_ADMIN_REQUIRED: u64 = 3;
    const E_PROJECT_ADMIN_ALREADY_EXISTS: u64 = 4;
    const E_PROJECT_ADMIN_NOT_FOUND: u64 = 5;
    const E_FORM_NOT_FOUND: u64 = 6;
    const E_FORM_INACTIVE: u64 = 7;
    const E_SIGNAL_NOT_FOUND: u64 = 8;
    const E_FORM_HAS_SIGNALS: u64 = 9;
    const E_NOT_AUTHORIZED: u64 = 10;
    const E_PROJECT_MEMBER_ALREADY_EXISTS: u64 = 11;
    const E_PROJECT_MEMBER_NOT_FOUND: u64 = 12;
    const E_INVALID_ROLE: u64 = 13;
    const E_OWNER_MEMBER_PROTECTED: u64 = 14;
    const E_PROJECT_NOT_EMPTY: u64 = 15;

    const SIGNAL_STATUS_NEW: u8 = 0;
    const SIGNAL_STATUS_TRIAGED: u8 = 1;
    const SIGNAL_STATUS_ARCHIVED: u8 = 2;

    const ROLE_OWNER: u8 = 0;
    const ROLE_CO_ADMIN: u8 = 1;
    const ROLE_REVIEWER: u8 = 2;

    public struct Member has copy, drop, store {
        addr: address,
        role: u8,
    }

    public struct Project has key {
        id: sui::object::UID,
        project_id: sui::object::ID,
        name: String,
        owner: address,
        admins: vector<address>,
        members: vector<Member>,
        forms_count: u64,
        signals_count: u64,
        next_form_id: u64,
        created_at: u64,
        forms: vector<Form>,
        signals: vector<SignalReceipt>,
    }

    public struct ProjectOwnerCap has key, store {
        id: sui::object::UID,
        project_id: sui::object::ID,
    }

    public struct Form has copy, drop, store {
        form_id: u64,
        project_id: sui::object::ID,
        title: String,
        metadata_digest: String,
        created_at: u64,
        active: bool,
    }

    public struct SignalReceipt has copy, drop, store {
        signal_id: u64,
        project_id: sui::object::ID,
        form_id: u64,
        walrus_blob_id: String,
        metadata_digest: String,
        encrypted: bool,
        seal_identity: Option<String>,
        created_at: u64,
        submitter: Option<address>,
        status: u8,
    }

    public struct ProjectCreated has copy, drop {
        project_id: sui::object::ID,
        owner: address,
        name: String,
        created_at: u64,
    }

    public struct AdminAdded has copy, drop {
        project_id: sui::object::ID,
        admin: address,
        actor: address,
    }

    public struct AdminRemoved has copy, drop {
        project_id: sui::object::ID,
        admin: address,
        actor: address,
    }

    public struct ProjectMemberAdded has copy, drop {
        project_id: sui::object::ID,
        member: address,
        role: u8,
        actor: address,
    }

    public struct ProjectMemberRemoved has copy, drop {
        project_id: sui::object::ID,
        member: address,
        role: u8,
        actor: address,
    }

    public struct ProjectMemberRoleUpdated has copy, drop {
        project_id: sui::object::ID,
        member: address,
        previous_role: u8,
        role: u8,
        actor: address,
    }

    public struct FormCreated has copy, drop {
        project_id: sui::object::ID,
        form_id: u64,
        title: String,
        metadata_digest: String,
        actor: address,
        created_at: u64,
    }

    public struct FormStatusChanged has copy, drop {
        project_id: sui::object::ID,
        form_id: u64,
        active: bool,
        actor: address,
    }

    public struct FormDeleted has copy, drop {
        project_id: sui::object::ID,
        form_id: u64,
        title: String,
        actor: address,
    }

    public struct SignalRegistered has copy, drop {
        project_id: sui::object::ID,
        form_id: u64,
        signal_id: u64,
        walrus_blob_id: String,
        metadata_digest: String,
        encrypted: bool,
        actor: address,
        created_at: u64,
    }

    public struct SignalStatusUpdated has copy, drop {
        project_id: sui::object::ID,
        signal_id: u64,
        status: u8,
        actor: address,
    }

    public struct ProjectDeleted has copy, drop {
        project_id: sui::object::ID,
        actor: address,
        forms_count: u64,
        signals_count: u64,
    }

    fun create_project_internal(
        name: String,
        owner: address,
        created_at: u64,
        ctx: &mut sui::tx_context::TxContext,
    ): (Project, ProjectOwnerCap) {
        let project_uid = sui::object::new(ctx);
        let project_id = sui::object::uid_to_inner(&project_uid);
        let owner_cap_uid = sui::object::new(ctx);

        (
            Project {
                id: project_uid,
                project_id,
                name,
                owner,
                admins: vector[],
                members: vector[],
                forms_count: 0,
                signals_count: 0,
                next_form_id: 0,
                created_at,
                forms: vector[],
                signals: vector[],
            },
            ProjectOwnerCap {
                id: owner_cap_uid,
                project_id,
            },
        )
    }

    fun assert_global_owner(
        registry: &access_control::Registry,
        owner_cap: &access_control::OwnerCap,
        sender: address,
    ) {
        assert!(
            access_control::is_owner(registry, sender, sui::object::id(owner_cap)),
            E_GLOBAL_ADMIN_REQUIRED
        );
    }

    fun assert_global_admin(
        registry: &access_control::Registry,
        admin_cap: &access_control::AdminCap,
        sender: address,
    ) {
        assert!(
            access_control::is_admin(registry, sender, sui::object::id(admin_cap)),
            E_GLOBAL_ADMIN_REQUIRED
        );
    }

    fun assert_project_owner(project: &Project, owner_cap: &ProjectOwnerCap, sender: address) {
        assert!(owner_cap.project_id == project.project_id, E_PROJECT_OWNER_CAP_MISMATCH);
        assert!(project.owner == sender, E_PROJECT_ADMIN_REQUIRED);
    }

    fun is_valid_role(role: u8): bool {
        role == ROLE_OWNER || role == ROLE_CO_ADMIN || role == ROLE_REVIEWER
    }

    fun find_member_index(members: &vector<Member>, candidate: address): Option<u64> {
        let mut index = 0;
        let total = vector::length(members);
        while (index < total) {
            if (vector::borrow(members, index).addr == candidate) {
                return option::some(index)
            };
            index = index + 1;
        };
        option::none()
    }

    fun member_has_role(project: &Project, candidate: address, role: u8): bool {
        let member_index = find_member_index(&project.members, candidate);
        if (option::is_none(&member_index)) {
            return false
        };

        vector::borrow(&project.members, *option::borrow(&member_index)).role == role
    }

    fun assert_project_admin(project: &Project, sender: address) {
        assert!(can_manage(project, sender), E_NOT_AUTHORIZED);
    }

    fun assert_can_review(project: &Project, sender: address) {
        assert!(can_review(project, sender), E_NOT_AUTHORIZED);
    }

    fun contains_admin(admins: &vector<address>, candidate: address): bool {
        let mut index = 0;
        let total = vector::length(admins);
        while (index < total) {
            if (*vector::borrow(admins, index) == candidate) {
                return true
            };
            index = index + 1;
        };
        false
    }

    public fun is_owner(project: &Project, wallet: address): bool {
        project.owner == wallet
    }

    public fun is_co_admin(project: &Project, wallet: address): bool {
        is_owner(project, wallet)
            || contains_admin(&project.admins, wallet)
            || member_has_role(project, wallet, ROLE_CO_ADMIN)
    }

    public fun is_reviewer(project: &Project, wallet: address): bool {
        member_has_role(project, wallet, ROLE_REVIEWER)
    }

    public fun can_view(project: &Project, wallet: address): bool {
        is_owner(project, wallet) || is_co_admin(project, wallet) || is_reviewer(project, wallet)
    }

    public fun can_review(project: &Project, wallet: address): bool {
        is_owner(project, wallet) || is_co_admin(project, wallet) || is_reviewer(project, wallet)
    }

    public fun can_manage(project: &Project, wallet: address): bool {
        is_owner(project, wallet) || is_co_admin(project, wallet)
    }

    public fun can_manage_members(project: &Project, wallet: address): bool {
        is_owner(project, wallet)
    }

    fun namespace(project: &Project): vector<u8> {
        project.project_id.to_bytes()
    }

    fun has_prefix(prefix: &vector<u8>, value: &vector<u8>): bool {
        let prefix_len = vector::length(prefix);
        let value_len = vector::length(value);
        if (prefix_len > value_len) {
            return false
        };

        let mut index = 0;
        while (index < prefix_len) {
            if (*vector::borrow(prefix, index) != *vector::borrow(value, index)) {
                return false
            };
            index = index + 1;
        };

        true
    }

    fun find_form_index(forms: &vector<Form>, form_id: u64): u64 {
        let mut index = 0;
        let total = vector::length(forms);
        while (index < total) {
            let form = vector::borrow(forms, index);
            if (form.form_id == form_id) {
                return index
            };
            index = index + 1;
        };
        assert!(false, E_FORM_NOT_FOUND);
        0
    }

    fun find_signal_index(signals: &vector<SignalReceipt>, signal_id: u64): u64 {
        let mut index = 0;
        let total = vector::length(signals);
        while (index < total) {
            let signal = vector::borrow(signals, index);
            if (signal.signal_id == signal_id) {
                return index
            };
            index = index + 1;
        };
        assert!(false, E_SIGNAL_NOT_FOUND);
        0
    }

    fun form_has_signals(signals: &vector<SignalReceipt>, form_id: u64): bool {
        let mut index = 0;
        let total = vector::length(signals);
        while (index < total) {
            let signal = vector::borrow(signals, index);
            if (signal.form_id == form_id) {
                return true
            };
            index = index + 1;
        };
        false
    }

    public fun create_project(
        admin_cap: &access_control::AdminCap,
        registry: &access_control::Registry,
        name: String,
        ctx: &mut sui::tx_context::TxContext,
    ): ProjectOwnerCap {
        let sender = sui::tx_context::sender(ctx);
        assert_global_admin(registry, admin_cap, sender);

        let created_at = sui::tx_context::epoch_timestamp_ms(ctx);
        let (project, owner_cap) = create_project_internal(name, sender, created_at, ctx);
        let project_id = project.project_id;
        let event_name = project.name;

        sui::event::emit(ProjectCreated {
            project_id,
            owner: sender,
            name: event_name,
            created_at,
        });

        sui::transfer::share_object(project);
        owner_cap
    }

    public fun create_project_by_owner(
        owner_cap: &access_control::OwnerCap,
        registry: &access_control::Registry,
        name: String,
        ctx: &mut sui::tx_context::TxContext,
    ): ProjectOwnerCap {
        let sender = sui::tx_context::sender(ctx);
        assert_global_owner(registry, owner_cap, sender);

        let created_at = sui::tx_context::epoch_timestamp_ms(ctx);
        let (project, project_owner_cap) = create_project_internal(name, sender, created_at, ctx);
        let project_id = project.project_id;
        let event_name = project.name;

        sui::event::emit(ProjectCreated {
            project_id,
            owner: sender,
            name: event_name,
            created_at,
        });

        sui::transfer::share_object(project);
        project_owner_cap
    }

    public fun add_admin(
        project: &mut Project,
        owner_cap: &ProjectOwnerCap,
        admin_address: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_project_owner(project, owner_cap, sender);
        assert!(
            !contains_admin(&project.admins, admin_address),
            E_PROJECT_ADMIN_ALREADY_EXISTS
        );

        vector::push_back(&mut project.admins, admin_address);

        sui::event::emit(AdminAdded {
            project_id: project.project_id,
            admin: admin_address,
            actor: sender,
        });
    }

    public fun add_project_member(
        project: &mut Project,
        owner_cap: &ProjectOwnerCap,
        member_address: address,
        role: u8,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_project_owner(project, owner_cap, sender);
        assert!(is_valid_role(role) && role != ROLE_OWNER, E_INVALID_ROLE);
        assert!(member_address != project.owner, E_OWNER_MEMBER_PROTECTED);
        assert!(!contains_admin(&project.admins, member_address), E_PROJECT_MEMBER_ALREADY_EXISTS);
        assert!(
            option::is_none(&find_member_index(&project.members, member_address)),
            E_PROJECT_MEMBER_ALREADY_EXISTS,
        );

        vector::push_back(
            &mut project.members,
            Member {
                addr: member_address,
                role,
            },
        );

        sui::event::emit(ProjectMemberAdded {
            project_id: project.project_id,
            member: member_address,
            role,
            actor: sender,
        });
    }

    public fun remove_admin(
        project: &mut Project,
        owner_cap: &ProjectOwnerCap,
        admin_address: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_project_owner(project, owner_cap, sender);

        let mut index = 0;
        let total = vector::length(&project.admins);
        while (index < total) {
            if (*vector::borrow(&project.admins, index) == admin_address) {
                vector::swap_remove(&mut project.admins, index);
                sui::event::emit(AdminRemoved {
                    project_id: project.project_id,
                    admin: admin_address,
                    actor: sender,
                });
                return
            };
            index = index + 1;
        };

        assert!(false, E_PROJECT_ADMIN_NOT_FOUND);
    }

    public fun remove_project_member(
        project: &mut Project,
        owner_cap: &ProjectOwnerCap,
        member_address: address,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_project_owner(project, owner_cap, sender);
        assert!(member_address != project.owner, E_OWNER_MEMBER_PROTECTED);

        let member_index = find_member_index(&project.members, member_address);
        if (option::is_some(&member_index)) {
            let removed = vector::swap_remove(
                &mut project.members,
                *option::borrow(&member_index),
            );

            sui::event::emit(ProjectMemberRemoved {
                project_id: project.project_id,
                member: member_address,
                role: removed.role,
                actor: sender,
            });
            return
        };

        let mut legacy_index = 0;
        let legacy_total = vector::length(&project.admins);
        while (legacy_index < legacy_total) {
            if (*vector::borrow(&project.admins, legacy_index) == member_address) {
                vector::swap_remove(&mut project.admins, legacy_index);
                sui::event::emit(ProjectMemberRemoved {
                    project_id: project.project_id,
                    member: member_address,
                    role: ROLE_CO_ADMIN,
                    actor: sender,
                });
                return
            };
            legacy_index = legacy_index + 1;
        };

        assert!(false, E_PROJECT_MEMBER_NOT_FOUND);
    }

    public fun update_project_member_role(
        project: &mut Project,
        owner_cap: &ProjectOwnerCap,
        member_address: address,
        role: u8,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_project_owner(project, owner_cap, sender);
        assert!(is_valid_role(role) && role != ROLE_OWNER, E_INVALID_ROLE);
        assert!(member_address != project.owner, E_OWNER_MEMBER_PROTECTED);

        let member_index = find_member_index(&project.members, member_address);
        assert!(option::is_some(&member_index), E_PROJECT_MEMBER_NOT_FOUND);
        let member = vector::borrow_mut(&mut project.members, *option::borrow(&member_index));
        let previous_role = member.role;
        member.role = role;

        sui::event::emit(ProjectMemberRoleUpdated {
            project_id: project.project_id,
            member: member_address,
            previous_role,
            role,
            actor: sender,
        });
    }

    public fun delete_project(
        project: Project,
        owner_cap: ProjectOwnerCap,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_project_owner(&project, &owner_cap, sender);
        assert!(
            project.forms_count == 0
                && project.signals_count == 0
                && vector::length(&project.forms) == 0
                && vector::length(&project.signals) == 0,
            E_PROJECT_NOT_EMPTY,
        );

        sui::event::emit(ProjectDeleted {
            project_id: project.project_id,
            actor: sender,
            forms_count: project.forms_count,
            signals_count: project.signals_count,
        });

        destroy_project_owner_cap(owner_cap);
        destroy_project(project);
    }

    public fun create_form(
        project: &mut Project,
        title: String,
        metadata_digest: String,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_project_admin(project, sender);

        let form_id = project.next_form_id;
        project.next_form_id = form_id + 1;
        let created_at = sui::tx_context::epoch_timestamp_ms(ctx);
        let form = Form {
            form_id,
            project_id: project.project_id,
            title,
            metadata_digest,
            created_at,
            active: true,
        };

        let event_title = form.title;
        let event_digest = form.metadata_digest;
        vector::push_back(&mut project.forms, form);
        project.forms_count = vector::length(&project.forms);

        sui::event::emit(FormCreated {
            project_id: project.project_id,
            form_id,
            title: event_title,
            metadata_digest: event_digest,
            actor: sender,
            created_at,
        });
    }

    public fun set_form_active(
        project: &mut Project,
        form_id: u64,
        active: bool,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_project_admin(project, sender);

        let index = find_form_index(&project.forms, form_id);
        let form = vector::borrow_mut(&mut project.forms, index);
        form.active = active;

        sui::event::emit(FormStatusChanged {
            project_id: project.project_id,
            form_id,
            active,
            actor: sender,
        });
    }

    public fun register_signal(
        project: &mut Project,
        form_id: u64,
        walrus_blob_id: String,
        metadata_digest: String,
        encrypted: bool,
        seal_identity: Option<String>,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let form_index = find_form_index(&project.forms, form_id);
        let form = vector::borrow(&project.forms, form_index);
        assert!(form.active, E_FORM_INACTIVE);

        let sender = sui::tx_context::sender(ctx);
        let signal_id = project.signals_count;
        let created_at = sui::tx_context::epoch_timestamp_ms(ctx);
        let receipt = SignalReceipt {
            signal_id,
            project_id: project.project_id,
            form_id,
            walrus_blob_id,
            metadata_digest,
            encrypted,
            seal_identity,
            created_at,
            submitter: option::some(sender),
            status: SIGNAL_STATUS_NEW,
        };

        let event_blob = receipt.walrus_blob_id;
        let event_digest = receipt.metadata_digest;
        vector::push_back(&mut project.signals, receipt);
        project.signals_count = project.signals_count + 1;

        sui::event::emit(SignalRegistered {
            project_id: project.project_id,
            form_id,
            signal_id,
            walrus_blob_id: event_blob,
            metadata_digest: event_digest,
            encrypted,
            actor: sender,
            created_at,
        });
    }

    public fun update_signal_status(
        project: &mut Project,
        signal_id: u64,
        status: u8,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_can_review(project, sender);

        let index = find_signal_index(&project.signals, signal_id);
        let signal = vector::borrow_mut(&mut project.signals, index);
        signal.status = status;

        sui::event::emit(SignalStatusUpdated {
            project_id: project.project_id,
            signal_id,
            status,
            actor: sender,
        });
    }

    public fun delete_form(
        project: &mut Project,
        form_id: u64,
        ctx: &mut sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_project_admin(project, sender);
        assert!(!form_has_signals(&project.signals, form_id), E_FORM_HAS_SIGNALS);

        let index = find_form_index(&project.forms, form_id);
        let form = vector::swap_remove(&mut project.forms, index);
        project.forms_count = vector::length(&project.forms);

        sui::event::emit(FormDeleted {
            project_id: project.project_id,
            form_id,
            title: form.title,
            actor: sender,
        });
    }

    entry fun seal_approve_project_signal(
        id: vector<u8>,
        project: &Project,
        ctx: &sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert_can_review(project, sender);
        assert!(has_prefix(&namespace(project), &id), E_NOT_AUTHORIZED);
    }

    entry fun seal_approve_project_admin(
        _id: vector<u8>,
        project: &Project,
        ctx: &sui::tx_context::TxContext,
    ) {
        assert!(can_manage(project, sui::tx_context::sender(ctx)), E_NOT_AUTHORIZED);
    }

    entry fun seal_approve_owner_signal(
        id: vector<u8>,
        ctx: &sui::tx_context::TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        assert!(has_prefix(&sender.to_bytes(), &id), E_NOT_AUTHORIZED);
    }

    public fun project_id(cap: &ProjectOwnerCap): sui::object::ID {
        cap.project_id
    }

    public fun signal_status_new(): u8 {
        SIGNAL_STATUS_NEW
    }

    public fun signal_status_triaged(): u8 {
        SIGNAL_STATUS_TRIAGED
    }

    public fun signal_status_archived(): u8 {
        SIGNAL_STATUS_ARCHIVED
    }

    public fun project_stats(project: &Project): (u64, u64, u64) {
        (
            vector::length(&project.admins) + vector::length(&project.members),
            project.forms_count,
            project.signals_count,
        )
    }

    public fun is_project_admin(project: &Project, wallet: address): bool {
        can_manage(project, wallet)
    }

    public fun role_owner(): u8 {
        ROLE_OWNER
    }

    public fun role_co_admin(): u8 {
        ROLE_CO_ADMIN
    }

    public fun role_reviewer(): u8 {
        ROLE_REVIEWER
    }

    public fun form_is_active(project: &Project, form_id: u64): bool {
        let index = find_form_index(&project.forms, form_id);
        vector::borrow(&project.forms, index).active
    }

    fun destroy_project(project: Project) {
        let Project {
            id,
            project_id: _,
            name: _,
            owner: _,
            admins: _,
            members: _,
            forms_count: _,
            signals_count: _,
            next_form_id: _,
            created_at: _,
            forms: _,
            signals: _,
        } = project;
        sui::object::delete(id);
    }

    fun destroy_project_owner_cap(cap: ProjectOwnerCap) {
        let ProjectOwnerCap {
            id,
            project_id: _,
        } = cap;
        sui::object::delete(id);
    }

    #[test]
    #[expected_failure(abort_code = E_GLOBAL_ADMIN_REQUIRED)]
    fun create_project_requires_global_admin_cap() {
        let owner = @0xA;
        let non_admin = @0xB;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 1, 7, 1000, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let outsider_ctx = &mut sui::tx_context::new_from_hint(non_admin, 2, 7, 1001, 0);

        let forbidden_owner_cap = create_project_by_owner(
            &owner_cap,
            &registry,
            std::string::utf8(b"forbidden"),
            outsider_ctx,
        );
        destroy_project_owner_cap(forbidden_owner_cap);

        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun owner_can_add_admin() {
        let owner = @0xA;
        let admin = @0xB;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 3, 7, 1100, 0);
        let (mut registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1100,
            owner_ctx,
        );
        let global_admin_cap = access_control::new_test_admin_cap(
            &owner_cap,
            &mut registry,
            admin,
            owner_ctx,
        );

        add_admin(&mut project, &project_owner_cap, admin, owner_ctx);

        assert!(is_project_admin(&project, admin), 0);

        access_control::destroy_test_admin_cap(global_admin_cap);
        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun admin_can_create_form() {
        let owner = @0xA;
        let admin = @0xB;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 4, 7, 1200, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1200,
            owner_ctx,
        );
        add_admin(&mut project, &project_owner_cap, admin, owner_ctx);

        let admin_ctx = &mut sui::tx_context::new_from_hint(admin, 5, 7, 1201, 0);
        create_form(
            &mut project,
            std::string::utf8(b"feedback"),
            std::string::utf8(b"digest-1"),
            admin_ctx,
        );

        let (_, forms_count, _) = project_stats(&project);
        assert!(forms_count == 1, 0);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_AUTHORIZED)]
    fun non_admin_cannot_create_form() {
        let owner = @0xA;
        let outsider = @0xC;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 6, 7, 1300, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1300,
            owner_ctx,
        );
        let outsider_ctx = &mut sui::tx_context::new_from_hint(outsider, 7, 7, 1301, 0);

        create_form(
            &mut project,
            std::string::utf8(b"feedback"),
            std::string::utf8(b"digest-1"),
            outsider_ctx,
        );

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun co_admin_member_can_manage_project_operations() {
        let owner = @0xA;
        let co_admin = @0xB;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 25, 7, 1310, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1310,
            owner_ctx,
        );
        add_project_member(&mut project, &project_owner_cap, co_admin, ROLE_CO_ADMIN, owner_ctx);

        let co_admin_ctx = &mut sui::tx_context::new_from_hint(co_admin, 26, 7, 1311, 0);
        create_form(
            &mut project,
            std::string::utf8(b"field report"),
            std::string::utf8(b"digest-co-admin"),
            co_admin_ctx,
        );
        set_form_active(&mut project, 0, false, co_admin_ctx);

        let (_, forms_count, _) = project_stats(&project);
        assert!(forms_count == 1, 0);
        assert!(!form_is_active(&project, 0), 0);
        assert!(can_manage(&project, co_admin), 0);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun reviewer_member_can_triage_but_not_manage() {
        let owner = @0xA;
        let reviewer = @0xB;
        let submitter = @0xD;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 27, 7, 1320, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1320,
            owner_ctx,
        );
        add_project_member(&mut project, &project_owner_cap, reviewer, ROLE_REVIEWER, owner_ctx);
        create_form(
            &mut project,
            std::string::utf8(b"field report"),
            std::string::utf8(b"digest-reviewer"),
            owner_ctx,
        );

        let submitter_ctx = &mut sui::tx_context::new_from_hint(submitter, 28, 7, 1321, 0);
        register_signal(
            &mut project,
            0,
            std::string::utf8(b"blob-reviewer"),
            std::string::utf8(b"meta-reviewer"),
            false,
            option::none(),
            submitter_ctx,
        );

        let reviewer_ctx = &mut sui::tx_context::new_from_hint(reviewer, 29, 7, 1322, 0);
        update_signal_status(&mut project, 0, SIGNAL_STATUS_TRIAGED, reviewer_ctx);
        let signal = vector::borrow(&project.signals, 0);
        assert!(signal.status == SIGNAL_STATUS_TRIAGED, 0);
        assert!(can_review(&project, reviewer), 0);
        assert!(!can_manage(&project, reviewer), 0);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_AUTHORIZED)]
    fun reviewer_member_cannot_create_form() {
        let owner = @0xA;
        let reviewer = @0xB;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 30, 7, 1330, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1330,
            owner_ctx,
        );
        add_project_member(&mut project, &project_owner_cap, reviewer, ROLE_REVIEWER, owner_ctx);

        let reviewer_ctx = &mut sui::tx_context::new_from_hint(reviewer, 31, 7, 1331, 0);
        create_form(
            &mut project,
            std::string::utf8(b"forbidden"),
            std::string::utf8(b"digest-forbidden"),
            reviewer_ctx,
        );

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    #[expected_failure(abort_code = E_PROJECT_MEMBER_ALREADY_EXISTS)]
    fun duplicate_project_member_is_rejected() {
        let owner = @0xA;
        let reviewer = @0xB;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 32, 7, 1340, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1340,
            owner_ctx,
        );

        add_project_member(&mut project, &project_owner_cap, reviewer, ROLE_REVIEWER, owner_ctx);
        add_project_member(&mut project, &project_owner_cap, reviewer, ROLE_CO_ADMIN, owner_ctx);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    #[expected_failure(abort_code = E_OWNER_MEMBER_PROTECTED)]
    fun owner_cannot_be_added_as_project_member() {
        let owner = @0xA;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 33, 7, 1350, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1350,
            owner_ctx,
        );

        add_project_member(&mut project, &project_owner_cap, owner, ROLE_CO_ADMIN, owner_ctx);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun legacy_admin_vector_still_grants_manage_permissions() {
        let owner = @0xA;
        let legacy_admin = @0xB;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 34, 7, 1360, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1360,
            owner_ctx,
        );
        add_admin(&mut project, &project_owner_cap, legacy_admin, owner_ctx);

        let legacy_admin_ctx = &mut sui::tx_context::new_from_hint(legacy_admin, 35, 7, 1361, 0);
        create_form(
            &mut project,
            std::string::utf8(b"legacy admin form"),
            std::string::utf8(b"digest-legacy"),
            legacy_admin_ctx,
        );

        assert!(can_manage(&project, legacy_admin), 0);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun legacy_admin_can_be_removed_through_member_entrypoint() {
        let owner = @0xA;
        let legacy_admin = @0xB;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 36, 7, 1370, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1370,
            owner_ctx,
        );
        add_admin(&mut project, &project_owner_cap, legacy_admin, owner_ctx);

        remove_project_member(&mut project, &project_owner_cap, legacy_admin, owner_ctx);

        assert!(!can_manage(&project, legacy_admin), 0);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun active_form_accepts_signal_registration() {
        let owner = @0xA;
        let submitter = @0xD;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 8, 7, 1400, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1400,
            owner_ctx,
        );
        create_form(
            &mut project,
            std::string::utf8(b"feedback"),
            std::string::utf8(b"digest-1"),
            owner_ctx,
        );

        let submitter_ctx = &mut sui::tx_context::new_from_hint(submitter, 9, 7, 1401, 0);
        register_signal(
            &mut project,
            0,
            std::string::utf8(b"blob-1"),
            std::string::utf8(b"meta-1"),
            true,
            option::some(std::string::utf8(b"seal:project:0")),
            submitter_ctx,
        );

        let (_, _, signals_count) = project_stats(&project);
        assert!(signals_count == 1, 0);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    #[expected_failure(abort_code = E_FORM_INACTIVE)]
    fun inactive_form_rejects_signal_registration() {
        let owner = @0xA;
        let submitter = @0xD;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 10, 7, 1500, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1500,
            owner_ctx,
        );
        create_form(
            &mut project,
            std::string::utf8(b"feedback"),
            std::string::utf8(b"digest-1"),
            owner_ctx,
        );
        set_form_active(&mut project, 0, false, owner_ctx);

        let submitter_ctx = &mut sui::tx_context::new_from_hint(submitter, 11, 7, 1501, 0);
        register_signal(
            &mut project,
            0,
            std::string::utf8(b"blob-1"),
            std::string::utf8(b"meta-1"),
            true,
            option::none(),
            submitter_ctx,
        );

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun signal_status_update_is_admin_only() {
        let owner = @0xA;
        let admin = @0xB;
        let submitter = @0xD;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 12, 7, 1600, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1600,
            owner_ctx,
        );
        add_admin(&mut project, &project_owner_cap, admin, owner_ctx);
        create_form(
            &mut project,
            std::string::utf8(b"feedback"),
            std::string::utf8(b"digest-1"),
            owner_ctx,
        );

        let submitter_ctx = &mut sui::tx_context::new_from_hint(submitter, 13, 7, 1601, 0);
        register_signal(
            &mut project,
            0,
            std::string::utf8(b"blob-1"),
            std::string::utf8(b"meta-1"),
            false,
            option::none(),
            submitter_ctx,
        );

        let admin_ctx = &mut sui::tx_context::new_from_hint(admin, 14, 7, 1602, 0);
        update_signal_status(&mut project, 0, SIGNAL_STATUS_TRIAGED, admin_ctx);

        let signal = vector::borrow(&project.signals, 0);
        assert!(signal.status == SIGNAL_STATUS_TRIAGED, 0);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_AUTHORIZED)]
    fun non_admin_cannot_update_signal_status() {
        let owner = @0xA;
        let outsider = @0xE;
        let submitter = @0xD;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 15, 7, 1700, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1700,
            owner_ctx,
        );
        create_form(
            &mut project,
            std::string::utf8(b"feedback"),
            std::string::utf8(b"digest-1"),
            owner_ctx,
        );

        let submitter_ctx = &mut sui::tx_context::new_from_hint(submitter, 16, 7, 1701, 0);
        register_signal(
            &mut project,
            0,
            std::string::utf8(b"blob-1"),
            std::string::utf8(b"meta-1"),
            false,
            option::none(),
            submitter_ctx,
        );

        let outsider_ctx = &mut sui::tx_context::new_from_hint(outsider, 17, 7, 1702, 0);
        update_signal_status(&mut project, 0, SIGNAL_STATUS_ARCHIVED, outsider_ctx);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun owner_can_delete_project() {
        let owner = @0xA;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 3, 7, 1150, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1150,
            owner_ctx,
        );

        delete_project(project, project_owner_cap, owner_ctx);

        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    #[expected_failure(abort_code = E_PROJECT_NOT_EMPTY)]
    fun owner_cannot_delete_project_with_forms() {
        let owner = @0xA;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 37, 7, 1151, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1151,
            owner_ctx,
        );
        create_form(
            &mut project,
            std::string::utf8(b"feedback"),
            std::string::utf8(b"digest-not-empty"),
            owner_ctx,
        );

        delete_project(project, project_owner_cap, owner_ctx);

        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun admin_can_delete_form_without_signals() {
        let owner = @0xA;
        let admin = @0xB;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 19, 7, 1900, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1900,
            owner_ctx,
        );
        add_admin(&mut project, &project_owner_cap, admin, owner_ctx);
        let admin_ctx = &mut sui::tx_context::new_from_hint(admin, 20, 7, 1901, 0);

        create_form(
            &mut project,
            std::string::utf8(b"feedback"),
            std::string::utf8(b"digest-1"),
            owner_ctx,
        );
        delete_form(&mut project, 0, admin_ctx);

        let (_, forms_count, _) = project_stats(&project);
        assert!(forms_count == 0, 0);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    #[expected_failure(abort_code = E_FORM_HAS_SIGNALS)]
    fun form_with_signals_cannot_be_deleted() {
        let owner = @0xA;
        let submitter = @0xD;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 21, 7, 2000, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            2000,
            owner_ctx,
        );

        create_form(
            &mut project,
            std::string::utf8(b"feedback"),
            std::string::utf8(b"digest-1"),
            owner_ctx,
        );

        let submitter_ctx = &mut sui::tx_context::new_from_hint(submitter, 22, 7, 2001, 0);
        register_signal(
            &mut project,
            0,
            std::string::utf8(b"blob-1"),
            std::string::utf8(b"meta-1"),
            true,
            option::none(),
            submitter_ctx,
        );

        let delete_ctx = &mut sui::tx_context::new_from_hint(owner, 24, 7, 2002, 0);
        delete_form(&mut project, 0, delete_ctx);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun deleted_form_id_is_not_reused() {
        let owner = @0xA;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 23, 7, 2100, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (mut project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            2100,
            owner_ctx,
        );

        create_form(
            &mut project,
            std::string::utf8(b"feedback"),
            std::string::utf8(b"digest-1"),
            owner_ctx,
        );
        delete_form(&mut project, 0, owner_ctx);
        create_form(
            &mut project,
            std::string::utf8(b"second"),
            std::string::utf8(b"digest-2"),
            owner_ctx,
        );

        let form = vector::borrow(&project.forms, 0);
        assert!(form.form_id == 1, 0);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    fun project_admin_can_approve_seal_identity() {
        let owner = @0xA;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 18, 7, 1800, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1800,
            owner_ctx,
        );

        let namespace = namespace(&project);
        let mut scoped_id = namespace;
        vector::push_back(&mut scoped_id, 9);
        vector::push_back(&mut scoped_id, 7);

        seal_approve_project_signal(scoped_id, &project, owner_ctx);
        seal_approve_project_admin(vector[], &project, owner_ctx);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_AUTHORIZED)]
    fun project_signal_approval_rejects_wrong_namespace() {
        let owner = @0xA;
        let owner_ctx = &mut sui::tx_context::new_from_hint(owner, 19, 7, 1900, 0);
        let (registry, owner_cap) = access_control::new_test_registry(owner, owner_ctx);
        let (project, project_owner_cap) = create_project_internal(
            std::string::utf8(b"alpha"),
            owner,
            1900,
            owner_ctx,
        );

        seal_approve_project_signal(vector[1, 2, 3], &project, owner_ctx);

        destroy_project_owner_cap(project_owner_cap);
        destroy_project(project);
        access_control::destroy_test_owner_cap(owner_cap);
        access_control::destroy_test_registry(registry);
    }
}
