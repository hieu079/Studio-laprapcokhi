    // --- HỘP THÔNG BÁO TOAST UI ---
    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast-notification');
      const msg = document.getElementById('toast-message');
      const icon = document.getElementById('toast-icon');
      if (!toast || !msg) return;

      msg.textContent = message;
      toast.classList.remove('hidden');
      setTimeout(() => { toast.classList.add('hidden'); }, 3200);
    }

    // --- KHỞI TẠO 3D SCENE ---
    function init3D() {
      const container = document.getElementById('canvas-container');
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x05070c);
      selectionBounds = new THREE.Box3();
      selectionBoxHelper = new THREE.Box3Helper(selectionBounds, 0x22d3ee);
      selectionBoxHelper.visible = false;
      selectionBoxHelper.material.depthTest = false;
      selectionBoxHelper.renderOrder = 10;
      scene.add(selectionBoxHelper);

      camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
      camera.position.set(10, 12, 16);

      renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById('webgl-canvas'), 
        antialias: true, 
        powerPreference: "high-performance" 
      });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      let constrainedRotationDrag = null;
      transformControls = new THREE.TransformControls(camera, renderer.domElement);
      transformControls.addEventListener('mouseDown', event => {
        controls.enabled = false;
        constrainedRotationDrag = null;
        if (selectedPart && event.mode === 'rotate') {
          const constraint = getMagneticRotationConstraint(selectedPart);
          if (constraint.connection) {
            selectedPart.updateMatrixWorld(true);
            constraint.connection.pin.updateMatrixWorld(true);
            constrainedRotationDrag = {
              part: selectedPart,
              connection: constraint.connection,
              startWorldQuaternion: selectedPart.getWorldQuaternion(new THREE.Quaternion()),
              axis: getPartRotationAxis(selectedPart, constraint.connection)
            };
          }
        }
        if (selectedPart) {
          selectedPart.userData.safeTransform = {
            position: selectedPart.position.clone(),
            quaternion: selectedPart.quaternion.clone(),
            scale: selectedPart.scale.clone()
          };
        }
      });
      transformControls.addEventListener('mouseUp', () => {
        controls.enabled = true;
        constrainedRotationDrag = null;
        if (!selectedPart) return;
        selectedPart.userData.rotationLockNotified = false;
        if (hasPartCollision(selectedPart)) {
          const safe = selectedPart.userData.safeTransform || {
            position: selectedPart.position.clone(),
            quaternion: selectedPart.quaternion.clone(),
            scale: selectedPart.scale.clone()
          };
          selectedPart.position.copy(safe.position);
          selectedPart.quaternion.copy(safe.quaternion);
          selectedPart.scale.copy(safe.scale);
          showToast('Không thể di chuyển xuyên qua linh kiện khác', 'error');
        }
        updateSelectionBox();
      });
      transformControls.addEventListener('objectChange', () => {
        if (selectedPart) {
          const rotationConstraint = transformControls.getMode() === 'rotate'
            ? getMagneticRotationConstraint(selectedPart)
            : null;
          if (rotationConstraint?.locked) {
            const safe = selectedPart.userData.safeTransform;
            if (safe) {
              selectedPart.position.copy(safe.position);
              selectedPart.quaternion.copy(safe.quaternion);
              selectedPart.scale.copy(safe.scale);
            }
            if (!selectedPart.userData.rotationLockNotified) {
              showToast(selectedPart.userData.isPin
                ? 'Chốt đã liên kết với linh kiện nên không thể xoay'
                : 'Không thể xoay linh kiện đang liên kết với từ 2 chốt trở lên', 'error');
              selectedPart.userData.rotationLockNotified = true;
            }
            return;
          }

          if (rotationConstraint?.connection) {
            if (constrainedRotationDrag?.part === selectedPart) {
              const delta = selectedPart.getWorldQuaternion(new THREE.Quaternion())
                .multiply(constrainedRotationDrag.startWorldQuaternion.clone().invert())
                .normalize();
              if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);

              const rotationVector = new THREE.Vector3(delta.x, delta.y, delta.z);
              const sinHalfAngle = rotationVector.length();
              if (sinHalfAngle > 1e-8) {
                const angle = 2 * Math.atan2(sinHalfAngle, delta.w) *
                  rotationVector.normalize().dot(constrainedRotationDrag.axis);
                const startWorldQuaternion = constrainedRotationDrag.startWorldQuaternion.clone();
                const startingHoleAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(startWorldQuaternion);
                const alignedHoleAxis = constrainedRotationDrag.axis.clone();
                if (startingHoleAxis.dot(alignedHoleAxis) < 0) alignedHoleAxis.negate();
                const alignment = new THREE.Quaternion().setFromUnitVectors(startingHoleAxis, alignedHoleAxis);
                startWorldQuaternion.premultiply(alignment);
                const constrainedWorldQuaternion = new THREE.Quaternion()
                  .setFromAxisAngle(constrainedRotationDrag.axis, angle)
                  .multiply(startWorldQuaternion);
                if (selectedPart.parent) {
                  const parentWorldQuaternion = selectedPart.parent.getWorldQuaternion(new THREE.Quaternion());
                  constrainedWorldQuaternion.premultiply(parentWorldQuaternion.invert());
                }
                selectedPart.quaternion.copy(constrainedWorldQuaternion);
                selectedPart.updateMatrixWorld(true);
              }
            }
            keepMagneticConnectionAnchored(selectedPart, rotationConstraint.connection);
            if (hasPartCollision(selectedPart)) {
              const safe = selectedPart.userData.safeTransform;
              if (safe) {
                selectedPart.position.copy(safe.position);
                selectedPart.quaternion.copy(safe.quaternion);
                selectedPart.scale.copy(safe.scale);
              }
              showToast('Không thể xoay xuyên qua linh kiện khác', 'error');
              return;
            }
            selectedPart.userData.safeTransform = {
              position: selectedPart.position.clone(),
              quaternion: selectedPart.quaternion.clone(),
              scale: selectedPart.scale.clone()
            };
            updateSelectionBox();
            recordHistoryState();
            return;
          }

          settleAssemblyOnGround(selectedPart);
          snapPartPositionToGrid(selectedPart);
          if (hasPartCollision(selectedPart)) {
            const safe = selectedPart.userData.safeTransform || {
              position: selectedPart.position.clone(),
              quaternion: selectedPart.quaternion.clone(),
              scale: selectedPart.scale.clone()
            };
            selectedPart.position.copy(safe.position);
            selectedPart.quaternion.copy(safe.quaternion);
            selectedPart.scale.copy(safe.scale);
            showToast('Không thể di chuyển xuyên qua linh kiện khác', 'error');
            return;
          }
          selectedPart.userData.safeTransform = {
            position: selectedPart.position.clone(),
            quaternion: selectedPart.quaternion.clone(),
            scale: selectedPart.scale.clone()
          };
          clampPartToGround(selectedPart);
          updateSelectionBox();
        }
        recordHistoryState();
      });
      scene.add(transformControls);

      axesHelper = new THREE.AxesHelper(4);
      axesHelper.visible = false;
      scene.add(axesHelper);

      // Hệ thống ánh sáng Studio cân bằng
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
      dirLight.position.set(12, 20, 14);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.bias = -0.0001;
      scene.add(dirLight);

      const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.35);
      fillLight.position.set(-10, 10, -10);
      scene.add(fillLight);

      const grid = new THREE.GridHelper(50 * GRID_CELL_SIZE, 50, 0x0284c7, 0x1e293b);
      grid.position.set(GRID_ORIGIN_OFFSET, -0.01, GRID_ORIGIN_OFFSET);
      scene.add(grid);

      setupRaycaster();
      setupDragDrop();
      setupFileInputs();
      setupMobileSidebar();
      window.addEventListener('resize', onWindowResize);
      window.addEventListener('keydown', handleKeyboardRotation);

      transformControls.rotationSnap = Math.PI / 4;
      transformControls.translationSnap = GRID_CELL_SIZE;

      // Cập nhật giao diện toolbar ban đầu
      setToolMode('select');

      // (ĐÃ XÓA dòng spawnTechnicBeam mặc định để canvas trống)
      // spawnTechnicBeam(7, 0x94a3b8, 'Dầm Kỹ Thuật');
      
      // KHỞI TẠO LỊCH SỬ TRỐNG RỖNG BAN ĐẦU
      history = [];
      historyIndex = -1;
      updateHistoryButtons(); // Làm mờ 2 nút Trước / Sau ngay từ đầu

      animate()
    }

