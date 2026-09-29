// 1. Ghi lại trạng thái lịch sử
    function recordHistoryState() {
      const state = {
        parts: parts.map(p => ({
          id: p.userData.id,
          kind: inferPartKind(p),
          name: p.userData.name,
          pos: p.position.clone(),
          rot: p.rotation.clone(),
          color: p.userData.color,
          holesCount: (p.userData.holes || []).length
        })),
        joints: joints.map(serializeJointState)
      };

      // Cắt bỏ nhánh tương lai nếu người dùng đang Undo mà lại thực hiện hành động mới
      history = history.slice(0, historyIndex + 1);
      history.push(state);
      historyIndex++;
      updateHistoryButtons();
    }

    function serializeJointState(joint) {
      return {
        id: joint.id,
        partAId: joint.partA?.userData?.id,
        partBId: joint.partB?.userData?.id,
        socketA: joint.socketA ? { index: joint.socketA.index, dir: joint.socketA.dir } : null,
        socketB: joint.socketB ? { index: joint.socketB.index, dir: joint.socketB.dir } : null,
        pinId: joint.pin?.userData?.id || null
      };
    }

    function restoreJointStates(savedJoints = []) {
      const partsById = new Map(parts.map(part => [part.userData.id, part]));
      const resolveSocket = (part, socketData) => (part.userData.holes || []).find(socket =>
        socket.index === socketData?.index && (!socketData.dir || socket.dir === socketData.dir));

      joints = savedJoints.map(saved => {
        const partA = partsById.get(saved.partAId);
        const partB = partsById.get(saved.partBId);
        const socketA = partA && resolveSocket(partA, saved.socketA);
        const socketB = partB && resolveSocket(partB, saved.socketB);
        if (!partA || !partB || !socketA || !socketB) return null;

        return {
          id: saved.id || `joint_${Date.now()}`,
          partA,
          partB,
          socketA,
          socketB,
          pin: saved.pinId ? partsById.get(saved.pinId) || null : null
        };
      }).filter(Boolean);

      joints.forEach(joint => {
        if (!joint.id.startsWith('magnetic_joint_')) return;
        joint.partA.userData.magneticSnapped = true;
        joint.partB.userData.magneticSnapped = true;
        joint.partA.userData.magneticJointId = joint.id;
        joint.partB.userData.magneticJointId = joint.id;
      });
    }

    // 2. Quay lại trạng thái trước (Undo)
    function undoAssembly() {
      if (historyIndex > 0) {
        historyIndex--;
        restoreHistoryState(history[historyIndex]);
        updateHistoryButtons();
      } else if (historyIndex === 0) {
        // Khi đang ở bước 1 mà bấm Trước -> Quay về trạng thái trống (index = -1)
        historyIndex--;
        clearAllParts({ skipHistory: true }); // Xóa sạch model trên màn hình
        updateHistoryButtons();
        showToast('Đã về trạng thái ban đầu (Trống)');
      }
    }

    // 3. Tiến tới trạng thái sau (Redo)
    function redoAssembly() {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        restoreHistoryState(history[historyIndex]);
        updateHistoryButtons();
      }
    }

    // 4. Khôi phục trạng thái từ lịch sử
    function restoreHistoryState(state) {
      const snapshot = Array.isArray(state) ? state : (state?.parts || []);
      const savedJoints = Array.isArray(state) ? [] : (state?.joints || []);
      const snapshotIds = new Set(snapshot.map(s => s.id));

      if (selectedPart && !snapshotIds.has(selectedPart.userData.id)) selectPart(null);
      const partsToRemove = parts.filter(part => !snapshotIds.has(part.userData.id));
      partsToRemove.forEach(part => {
        scene.remove(part);
      });
      parts = parts.filter(part => snapshotIds.has(part.userData.id));

      snapshot.forEach(saved => {
        let part = parts.find(p => p.userData.id === saved.id);
        if (!part) {
          const restored = rebuildProjectPartFromSnapshot(saved);
          if (restored) {
            part = restored;
          }
        }

        if (!part) return;

        part.position.copy(saved.pos);
        part.rotation.copy(saved.rot);
        if (saved.color != null && part.userData) part.userData.color = saved.color;
        if (saved.name && part.userData) part.userData.name = saved.name;
        if (saved.holesCount && part.userData) part.userData.holesCount = saved.holesCount;
      });

      selectedParts = selectedParts.filter(part => parts.includes(part));
      updateSelectionBox();
      restoreJointStates(savedJoints);
      updatePartsCount();
      updateJoinWizardUI();
      updateJointsUI();
    }

    // 5. Hàm cập nhật nút sáng/mờ (DUY NHẤT HÀM NÀY)
    function updateHistoryButtons() {
      const undoBtn = document.getElementById('history-undo');
      const redoBtn = document.getElementById('history-redo');
      
      if (undoBtn) undoBtn.disabled = (historyIndex < 0);
      if (redoBtn) redoBtn.disabled = (historyIndex >= history.length - 1);
    }

    // ---------------------------------------------------------
    // CÁC HÀM TIỆN ÍCH (Giữ nguyên, không thay đổi)
    // ---------------------------------------------------------

    function setPartColor(hexColor) {
      if (!selectedPart) return;
      selectedPart.traverse(child => {
        if (child.isMesh && child.material && !child.userData.isBadge) {
          child.material.color.set(hexColor);
        }
      });
      selectedPart.userData.color = hexColor;
      recordHistoryState();
      showToast('Đã cập nhật màu sắc');
    }

    function toggleWireframe(checked) {
      const targetList = selectedPart ? [selectedPart] : parts;
      targetList.forEach(p => p.traverse(c => {
        if (c.isMesh && c.material) c.material.wireframe = checked;
      }));
    }

    function toggleAxes(checked) {
      if (axesHelper) axesHelper.visible = checked;
    }

    function toggleAngleSnap(checked) {
      angleSnapEnabled = checked;
      transformControls.rotationSnap = checked ? Math.PI / 4 : null;
      showToast(checked ? 'Bật bắt dính góc 45°' : 'Tắt bắt dính góc');
    }

    function rebuildProjectPartFromSnapshot(data) {
      if (!data || !data.kind) return null;

      if (data.kind === 'beam') {
        const part = spawnTechnicBeam(data.holesCount || 7, data.color || 0x94a3b8, data.name || 'Dầm Kỹ Thuật', { skipHistory: true, skipSelect: true });
        if (part) {
          if (data.id) part.userData.id = data.id;
          part.userData.kind = 'beam';
          part.position.set(data.pos?.[0] ?? 0, data.pos?.[1] ?? 0, data.pos?.[2] ?? 0);
          part.rotation.set(data.rot?.[0] ?? 0, data.rot?.[1] ?? 0, data.rot?.[2] ?? 0);
          return part;
        }
      }

      if (data.kind === 'dv-bar') {
        const part = spawnDVBar(data.holesCount || 5, { skipHistory: true, skipSelect: true });
        if (part) {
          if (data.id) part.userData.id = data.id;
          part.userData.kind = 'dv-bar';
          part.position.set(data.pos?.[0] ?? 0, data.pos?.[1] ?? 0, data.pos?.[2] ?? 0);
          part.rotation.set(data.rot?.[0] ?? 0, data.rot?.[1] ?? 0, data.rot?.[2] ?? 0);
          return part;
        }
      }

      if (data.kind === 'yellow-bracket') {
        const part = spawnYellowBracket({ skipHistory: true, skipSelect: true });
        if (part) {
          if (data.id) part.userData.id = data.id;
          part.userData.kind = 'yellow-bracket';
          part.position.set(data.pos?.[0] ?? 0, data.pos?.[1] ?? 0, data.pos?.[2] ?? 0);
          part.rotation.set(data.rot?.[0] ?? 0, data.rot?.[1] ?? 0, data.rot?.[2] ?? 0);
          return part;
        }
      }

      if (data.kind === 'pin') {
        const part = spawnStandalonePin(data.color || 0x0284c7, {
          skipHistory: true,
          skipSelect: true,
          socketCount: data.holesCount || 2
        });
        if (part) {
          if (data.id) part.userData.id = data.id;
          part.userData.kind = 'pin';
          part.userData.name = data.name || part.userData.name;
          part.position.set(data.pos?.[0] ?? 0, data.pos?.[1] ?? 0, data.pos?.[2] ?? 0);
          part.rotation.set(data.rot?.[0] ?? 0, data.rot?.[1] ?? 0, data.rot?.[2] ?? 0);
          return part;
        }
      }

      return null;
    }