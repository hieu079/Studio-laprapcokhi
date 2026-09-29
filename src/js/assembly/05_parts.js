    function spawnTechnicBeam(holesCount = 7, colorHex = 0x94a3b8, namePrefix = 'Dầm Kỹ Thuật', options = {}) {
      const { skipHistory = false, skipSelect = false } = options;
      const group = new THREE.Group();
      const { geom, halfLen } = createRealisticBeamGeometry(holesCount, BEAM_HEIGHT);
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.72,
        metalness: 0.0
      });

      const mainMesh = new THREE.Mesh(geom, mat);
      mainMesh.castShadow = true;
      mainMesh.receiveShadow = true;
      group.add(mainMesh);

      const collarMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.65, metalness: 0.05 });
      const sockets = [];

      for (let i = 1; i <= holesCount; i++) {
        const xPos = -halfLen + (i - 1) * DV;

        const collarGeom = new THREE.TorusGeometry(0.32, 0.022, 8, 24);
        collarGeom.rotateX(Math.PI / 2);
        const collarTop = new THREE.Mesh(collarGeom, collarMat);
        collarTop.position.set(xPos, BEAM_HEIGHT / 2 + 0.005, 0);
        group.add(collarTop);

        const socketNode = new THREE.Object3D();
        socketNode.name = `SOCKET_HOLE_V_${i}`;
        socketNode.position.set(xPos, BEAM_HEIGHT / 2, 0);
        socketNode.userData = { index: i, type: 'vertical', desc: `Lỗ đứng #${i}`, isSocketNode: true };
        group.add(socketNode);

        sockets.push({ index: i, x: xPos, y: BEAM_HEIGHT / 2, z: 0, dir: 'vertical', desc: `Lỗ #${i}` });
      }

      const partId = 'beam_' + Date.now() + '_' + Math.floor(Math.random() * 100);
      group.position.set((Math.random() - 0.5) * 3, BEAM_HEIGHT / 2, (Math.random() - 0.5) * 3);
      group.userData = {
        id: partId,
        name: `${namePrefix} (${holesCount} Lỗ)`,
        color: colorHex,
        holes: sockets,
        holesCount,
        kind: 'beam',
        minY: BEAM_HEIGHT / 2,
        isCustomPart: true
      };

      scene.add(group);
      parts.push(group);
      placeNewPartInEmptySpace(group);
      if (!skipSelect) selectPart(group);
      updatePartsCount();
      if (!skipHistory) {
        recordHistoryState();
        showToast(`Đã thêm ${namePrefix} (${holesCount} Lỗ)`);
      }
      return group;
    }

    function spawnDVBar(holesCount = 5, options = {}) {
      const { skipHistory = false, skipSelect = false } = options;
      const group = new THREE.Group();
      const height = 1.0;
      const { geom, halfLen } = createRealisticBeamGeometry(holesCount, height);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd4d4d8,
        metalness: 0.65,
        roughness: 0.32
      });

      const mainMesh = new THREE.Mesh(geom, mat);
      mainMesh.castShadow = true;
      mainMesh.receiveShadow = true;
      group.add(mainMesh);

      const sockets = [];

      for (let i = 1; i <= holesCount; i++) {
        const xPos = -halfLen + (i - 1) * DV;
        const socketNode = new THREE.Object3D();
        socketNode.name = `SOCKET_HOLE_V_${i}`;
        socketNode.position.set(xPos, height / 2, 0);
        socketNode.userData = { isSocketNode: true, index: i };
        group.add(socketNode);

        sockets.push({ index: i, x: xPos, y: height / 2, z: 0, dir: 'vertical', desc: `Lỗ DV #${i}` });
      }

      const partId = 'dv_' + Date.now();
      group.position.set((Math.random() - 0.5) * 3, height / 2, (Math.random() - 0.5) * 3);
      group.userData = { id: partId, name: `Thanh DV (${holesCount} Lỗ)`, color: 0xd4d4d8, holes: sockets, holesCount, kind: 'dv-bar', minY: height / 2, isCustomPart: true };

      scene.add(group);
      parts.push(group);
      placeNewPartInEmptySpace(group);
      if (!skipSelect) selectPart(group);
      updatePartsCount();
      if (!skipHistory) {
        recordHistoryState();
        showToast(`Đã thêm Thanh DV Thép CNC (${holesCount} Lỗ)`);
      }
      return group;
    }

    function spawnYellowBracket(options = {}) {
      const { skipHistory = false, skipSelect = false } = options;
      const group = new THREE.Group();
      const height = 1.0;
      const { geom, halfLen } = createRealisticBeamGeometry(3, height);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xeab308,
        roughness: 0.55,
        metalness: 0.12
      });

      const mainMesh = new THREE.Mesh(geom, mat);
      mainMesh.castShadow = true;
      group.add(mainMesh);

      const sockets = [];

      for (let i = 1; i <= 3; i++) {
        const xPos = -halfLen + (i - 1) * DV;
        const socketNode = new THREE.Object3D();
        socketNode.name = `SOCKET_HOLE_V_${i}`;
        socketNode.position.set(xPos, height / 2, 0);
        socketNode.userData = { isSocketNode: true, index: i };
        group.add(socketNode);

        sockets.push({ index: i, x: xPos, y: height / 2, z: 0, dir: 'vertical', desc: `Lỗ Nẹp #${i}` });
      }

      const partId = 'bracket_' + Date.now();
      group.position.set((Math.random() - 0.5) * 3, height / 2, (Math.random() - 0.5) * 3);
      group.userData = { id: partId, name: 'Nẹp Dập Sơn Vàng (3 Lỗ)', color: 0xeab308, holes: sockets, holesCount: 3, kind: 'yellow-bracket', minY: height / 2, isCustomPart: true };

      scene.add(group);
      parts.push(group);
      placeNewPartInEmptySpace(group);
      if (!skipSelect) selectPart(group);
      updatePartsCount();
      if (!skipHistory) {
        recordHistoryState();
        showToast('Đã thêm Nẹp Dập Sơn Vàng (3 Lỗ)');
      }
      return group;
    }

    function spawnStandalonePin(colorHex = 0x0284c7, options = {}) {
      const { skipHistory = false, skipSelect = false, socketCount = 2 } = options;
      const group = new THREE.Group();
      const pinMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.68, metalness: 0.0 });

      const pinLength = socketCount === 3 ? 3.0 : 2.0;
      const shaftGeom = new THREE.CylinderGeometry(0.24, 0.24, pinLength, 24);
      const shaftMesh = new THREE.Mesh(shaftGeom, pinMat);
      shaftMesh.castShadow = true;
      group.add(shaftMesh);

      const collarGeom = new THREE.CylinderGeometry(0.33, 0.33, 0.12, 24);
      const collarPositions = socketCount === 3 ? [-0.5, 0.5] : [0];
      collarPositions.forEach(positionY => {
        const collarMesh = new THREE.Mesh(collarGeom, pinMat);
        collarMesh.position.y = positionY;
        collarMesh.castShadow = true;
        group.add(collarMesh);
      });

      (socketCount === 3 ? [-1.4, 1.4] : [-0.9, 0.9]).forEach(y => {
        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.02, 8, 20), pinMat);
        lip.rotation.x = Math.PI / 2;
        lip.position.y = y;
        group.add(lip);
      });

      const socketYs = socketCount === 3 ? [1.0, 0, -1.0] : [1.0, -1.0];
      const sockets = socketYs.map((y, index) => ({
        index: index + 1,
        x: 0,
        y,
        z: 0,
        dir: 'vertical',
        desc: `Đầu chốt ${String.fromCharCode(65 + index)}`,
        snapToHoleCenter: socketCount === 3
      }));

      sockets.forEach(s => {
        const socketNode = new THREE.Object3D();
        socketNode.name = `SOCKET_HOLE_V_${s.index}`;
        socketNode.position.set(s.x, s.y, s.z);
        socketNode.userData = { isSocketNode: true, index: s.index };
        group.add(socketNode);
      });

      const partId = 'pin_' + Date.now();
      group.position.set((Math.random() - 0.5) * 3, pinLength / 2, (Math.random() - 0.5) * 3);
      const pinName = `Chốt ${socketCount}`;
      group.userData = { id: partId, name: pinName, color: colorHex, holes: sockets, holesCount: sockets.length, kind: 'pin', minY: pinLength / 2, isPin: true, isCustomPart: true };

      scene.add(group);
      parts.push(group);
      placeNewPartInEmptySpace(group);
      if (!skipSelect) selectPart(group);
      updatePartsCount();
      if (!skipHistory) {
        recordHistoryState();
        showToast(`Đã thêm ${pinName}`);
      }
      return group;
    }


